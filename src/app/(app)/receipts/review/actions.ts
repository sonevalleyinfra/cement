"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { receipts, retailers } from "@/db/schema";
import { findAccessibleFirm } from "@/lib/firm-access";
import { isUuid } from "@/lib/ids";
import { rolesFor } from "@/lib/permissions";
import { postEntry } from "@/lib/ledger";
import { notifyMoney } from "@/lib/notify";
import { checkOnlineVerification, planChequeAction } from "@/lib/payment-verification-rules";
import { getFirmNames, getReceiptLines } from "@/lib/receipts";
import { requireRole, writeBlock } from "@/lib/session";

export type ReviewResult = { ok: true } | { ok: false; error: string };

function refresh(retailerId: string, receiptId: string) {
  revalidatePath(`/receipts/${receiptId}`);
  revalidatePath("/receipts");
  revalidatePath("/receipts/review");
  revalidatePath("/ledger");
  revalidatePath(`/ledger/${retailerId}`);
}

/** Accounts / admin verify an online payment by typing the UTR from the bank statement. */
export async function verifyOnline(receiptId: string, utr: string): Promise<ReviewResult> {
  const session = await requireRole(...rolesFor("verifyPayments"));
  const blocked = await writeBlock();
  if (blocked) return { ok: false, error: blocked };
  if (!isUuid(receiptId)) return { ok: false, error: "Receipt not found." };
  let retailerId = "";
  const res = await db.transaction(async (tx): Promise<ReviewResult> => {
    const [receipt] = await tx.select().from(receipts).where(eq(receipts.id, receiptId)).for("update");
    if (!receipt) return { ok: false, error: "Receipt not found." };
    retailerId = receipt.retailerId;
    if (!receipt.receivedFirmId || !(await findAccessibleFirm(session.user.id, session.user.role, receipt.receivedFirmId)))
      return { ok: false, error: "You cannot work on this firm." };
    const check = checkOnlineVerification(session.user.role, receipt, String(utr ?? ""));
    if (!check.ok) return check;
    await tx.update(receipts).set({ status: "verified", updatedAt: new Date() }).where(eq(receipts.id, receiptId));
    // Tell the collector, inside the same transaction.
    const lines = await getReceiptLines(receipt.id, tx);
    const [shop] = await tx.select({ name: retailers.name }).from(retailers).where(eq(retailers.id, receipt.retailerId));
    await notifyMoney(tx, {
      event: "online_verified",
      firmId: lines.length === 1 ? lines[0].firmId : null,
      firmNames: await getFirmNames(lines.map((l) => l.firmId), tx),
      retailerName: shop?.name ?? null,
      amountPaise: receipt.totalPaise,
      actorId: session.user.id,
      collectorId: receipt.receivedBy,
      link: `/receipts/${receipt.id}`,
    });
    return { ok: true };
  });
  if (res.ok) refresh(retailerId, receiptId);
  return res;
}

/** Accounts / admin mark a pending cheque cleared or bounced. A bounce undoes every credit line. */
export async function setChequeStatus(receiptId: string, to: "cleared" | "bounced"): Promise<ReviewResult> {
  const session = await requireRole(...rolesFor("verifyPayments"));
  const blocked = await writeBlock();
  if (blocked) return { ok: false, error: blocked };
  if (!isUuid(receiptId)) return { ok: false, error: "Receipt not found." };
  let retailerId = "";
  const res = await db.transaction(async (tx): Promise<ReviewResult> => {
    const [receipt] = await tx.select().from(receipts).where(eq(receipts.id, receiptId)).for("update");
    if (!receipt) return { ok: false, error: "Receipt not found." };
    retailerId = receipt.retailerId;
    if (!receipt.receivedFirmId || !(await findAccessibleFirm(session.user.id, session.user.role, receipt.receivedFirmId)))
      return { ok: false, error: "You cannot work on this firm." };

    // Same lock order as a reversal (receipt, then retailer): a bounce changes the dues
    // that a receipt being saved at the same moment reads.
    await tx.select({ id: retailers.id }).from(retailers).where(eq(retailers.id, receipt.retailerId)).for("update");
    const lines = await getReceiptLines(receiptId, tx);
    const plan = planChequeAction(session.user.role, receipt, to, lines);
    if (!plan.ok) return plan;
    for (const l of plan.ledgerLines) {
      await postEntry(
        tx,
        { firmId: l.firmId, retailerId: receipt.retailerId, kind: "receipt_credit", amountPaise: l.amountPaise },
        session.user.id,
        `Cheque bounced, receipt #${receipt.receiptNo}`,
        receipt.id,
      );
    }
    await tx.update(receipts).set({ status: plan.status, updatedAt: new Date() }).where(eq(receipts.id, receiptId));
    return { ok: true };
  });
  if (res.ok) refresh(retailerId, receiptId);
  return res;
}
