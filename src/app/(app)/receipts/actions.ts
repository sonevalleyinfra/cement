"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { receipts, retailers, user, walletMovements } from "@/db/schema";
import { isUuid } from "@/lib/ids";
import { getBalance, postEntry } from "@/lib/ledger";
import { duesFrom } from "@/lib/ledger-rules";
import { notifyMoney } from "@/lib/notify";
import { rolesFor } from "@/lib/permissions";
import { planReceipt } from "@/lib/receipt-plan";
import { planReversal } from "@/lib/receipt-reversal";
import { PAYMENT_MODES } from "@/lib/receipt-rules";
import { requireRole } from "@/lib/session";
import { walletBalance } from "@/lib/wallet-rules";

export type DuesResult = { ok: true; duesPaise: number } | { ok: false; error: string };
export type SaveReceiptResult = { ok: true; id: string } | { ok: false; error: string };
export type ReverseResult = { ok: true } | { ok: false; error: string };

/** What one retailer owes right now (from the ledger; an advance counts as 0). */
export async function loadDues(retailerId: string): Promise<DuesResult> {
  await requireRole(...rolesFor("recordReceipt"));
  if (!isUuid(retailerId)) return { ok: false, error: "Retailer not found." };
  return { ok: true, duesPaise: duesFrom(await getBalance(retailerId)) };
}

const isWholePaise = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n);

/**
 * Saves one receipt: the receipt, one ledger credit for the retailer, and (cash) the money
 * in the collector's wallet, all in one transaction. The server re-checks every number.
 */
export async function saveReceipt(input: {
  retailerId: string;
  mode: string;
  totalPaise: number;
  utr?: string;
  chequeNumber?: string;
  chequeDate?: string;
  bankName?: string;
}): Promise<SaveReceiptResult> {
  const session = await requireRole(...rolesFor("recordReceipt"));
  if (!isUuid(input.retailerId)) return { ok: false, error: "Retailer not found." };
  if (!(PAYMENT_MODES as readonly string[]).includes(input.mode)) return { ok: false, error: "Pick a payment mode." };
  if (!isWholePaise(input.totalPaise)) return { ok: false, error: "Enter the amount received." };
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const plan = planReceipt({
    retailerId: input.retailerId,
    mode: input.mode,
    totalPaise: input.totalPaise,
    details: {
      utr: text(input.utr),
      chequeNumber: text(input.chequeNumber),
      chequeDate: text(input.chequeDate),
      bankName: text(input.bankName),
    },
  });
  if (!plan.ok) return plan;

  const res = await db.transaction(async (tx): Promise<SaveReceiptResult> => {
    // Lock the retailer so a reversal or a bounce of the same shop waits for this save.
    const [retailer] = await tx
      .select({ id: retailers.id, name: retailers.name })
      .from(retailers)
      .where(eq(retailers.id, input.retailerId))
      .for("no key update");
    if (!retailer) return { ok: false, error: "Retailer not found." };

    const [receipt] = await tx
      .insert(receipts)
      .values({
        retailerId: input.retailerId,
        mode: input.mode,
        totalPaise: input.totalPaise,
        utr: input.mode === "online" ? text(input.utr) : null,
        chequeNumber: input.mode === "cheque" ? text(input.chequeNumber) : null,
        chequeDate: input.mode === "cheque" ? text(input.chequeDate) : null,
        bankName: input.mode === "cheque" ? text(input.bankName) : null,
        status: plan.status,
        receivedBy: session.user.id,
      })
      .returning({ id: receipts.id, receiptNo: receipts.receiptNo });
    await postEntry(tx, plan.ledger, session.user.id, `Receipt #${receipt.receiptNo}`, receipt.id);
    // Cash goes into the collector's wallet.
    if (plan.walletPaise > 0) {
      await tx.insert(walletMovements).values({
        collectorId: session.user.id,
        kind: "collected",
        amountPaise: plan.walletPaise,
        receiptId: receipt.id,
        actorId: session.user.id,
      });
    }
    await notifyMoney(tx, {
      event: "payment_recorded",
      retailerName: retailer.name,
      amountPaise: input.totalPaise,
      actorId: session.user.id,
      link: `/receipts/${receipt.id}`,
    });
    return { ok: true, id: receipt.id };
  });
  if (res.ok) {
    revalidatePath("/wallet");
    revalidatePath("/receipts");
    revalidatePath("/ledger");
    revalidatePath(`/ledger/${input.retailerId}`);
  }
  return res;
}

/**
 * Reverses a whole receipt. Accounts / admin only.
 * Locks the receipt, then the retailer, then (cash) the collector, so it cannot race a
 * new receipt, a cheque bounce, a verification or a handover request.
 */
export async function reverseReceipt(receiptId: string, reason: string): Promise<ReverseResult> {
  const session = await requireRole(...rolesFor("reverseReceipt"));
  if (!isUuid(receiptId)) return { ok: false, error: "Receipt not found." };
  let retailerId = "";
  const res = await db.transaction(async (tx): Promise<ReverseResult> => {
    const [receipt] = await tx.select().from(receipts).where(eq(receipts.id, receiptId)).for("no key update");
    if (!receipt) return { ok: false, error: "Receipt not found." };
    retailerId = receipt.retailerId;
    const [retailer] = await tx
      .select({ id: retailers.id, name: retailers.name })
      .from(retailers)
      .where(eq(retailers.id, receipt.retailerId))
      .for("no key update");
    if (!retailer) return { ok: false, error: "Retailer not found." };

    let available = 0;
    if (receipt.mode === "cash") {
      // Lock the collector (like a handover request) so the cash cannot be handed over meanwhile.
      await tx.select({ id: user.id }).from(user).where(eq(user.id, receipt.receivedBy)).for("no key update");
      const moves = await tx.select().from(walletMovements).where(eq(walletMovements.collectorId, receipt.receivedBy));
      available = walletBalance(moves).availablePaise;
    }

    const plan = planReversal(session.user.role, receipt, reason, available);
    if (!plan.ok) return plan;
    await postEntry(
      tx,
      { retailerId: receipt.retailerId, kind: "receipt_credit", amountPaise: plan.ledgerPaise },
      session.user.id,
      plan.note,
      receipt.id,
    );
    if (plan.walletPaise > 0) {
      await tx.insert(walletMovements).values({
        collectorId: receipt.receivedBy,
        kind: "reversed",
        amountPaise: plan.walletPaise,
        receiptId: receipt.id,
        actorId: session.user.id,
      });
    }
    const now = new Date();
    await tx
      .update(receipts)
      .set({ status: "reversed", reversedAt: now, reversedBy: session.user.id, reversalReason: plan.reason, updatedAt: now })
      .where(eq(receipts.id, receipt.id));
    await notifyMoney(tx, {
      event: "receipt_reversed",
      retailerName: retailer.name,
      amountPaise: receipt.totalPaise,
      actorId: session.user.id,
      collectorId: receipt.receivedBy,
      link: `/receipts/${receipt.id}`,
      reason: plan.reason,
    });
    return { ok: true };
  });
  if (res.ok) {
    revalidatePath("/receipts");
    revalidatePath(`/receipts/${receiptId}`);
    revalidatePath("/receipts/review");
    revalidatePath("/wallet");
    revalidatePath("/ledger");
    revalidatePath(`/ledger/${retailerId}`);
  }
  return res;
}
