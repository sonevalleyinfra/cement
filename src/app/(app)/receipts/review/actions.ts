"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { receipts, retailers } from "@/db/schema";
import { isUuid } from "@/lib/ids";
import { rolesFor } from "@/lib/permissions";
import { postEntry } from "@/lib/ledger";
import { notifyMoney } from "@/lib/notify";
import { checkOnlineVerification, planChequeAction } from "@/lib/payment-verification-rules";
import { requireRole } from "@/lib/session";

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
  if (!isUuid(receiptId)) return { ok: false, error: "Receipt not found." };
  let retailerId = "";
  const res = await db.transaction(async (tx): Promise<ReviewResult> => {
    const [receipt] = await tx.select().from(receipts).where(eq(receipts.id, receiptId)).for("no key update");
    if (!receipt) return { ok: false, error: "Receipt not found." };
    retailerId = receipt.retailerId;
    const check = checkOnlineVerification(session.user.role, receipt, String(utr ?? ""));
    if (!check.ok) return check;
    await tx.update(receipts).set({ status: "verified", updatedAt: new Date() }).where(eq(receipts.id, receiptId));
    // Tell the collector, inside the same transaction.
    const [shop] = await tx.select({ name: retailers.name }).from(retailers).where(eq(retailers.id, receipt.retailerId));
    await notifyMoney(tx, {
      event: "online_verified",
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

/** Accounts / admin mark a pending cheque cleared or bounced. A bounce undoes the credit. */
export async function setChequeStatus(receiptId: string, to: "cleared" | "bounced"): Promise<ReviewResult> {
  const session = await requireRole(...rolesFor("verifyPayments"));
  if (!isUuid(receiptId)) return { ok: false, error: "Receipt not found." };
  let retailerId = "";
  const res = await db.transaction(async (tx): Promise<ReviewResult> => {
    const [receipt] = await tx.select().from(receipts).where(eq(receipts.id, receiptId)).for("no key update");
    if (!receipt) return { ok: false, error: "Receipt not found." };
    retailerId = receipt.retailerId;
    // Same lock order as a reversal (receipt, then retailer).
    await tx.select({ id: retailers.id }).from(retailers).where(eq(retailers.id, receipt.retailerId)).for("no key update");
    const plan = planChequeAction(session.user.role, receipt, to);
    if (!plan.ok) return plan;
    if (plan.ledgerPaise !== 0) {
      await postEntry(
        tx,
        { retailerId: receipt.retailerId, kind: "receipt_credit", amountPaise: plan.ledgerPaise },
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
