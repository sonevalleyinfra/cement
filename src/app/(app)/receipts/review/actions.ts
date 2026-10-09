"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { receiptAllocations, receipts } from "@/db/schema";
import { findAccessibleFirm } from "@/lib/firm-access";
import { isUuid } from "@/lib/ids";
import { rolesFor } from "@/lib/permissions";
import { postEntry } from "@/lib/ledger";
import { checkOnlineVerification, planChequeAction } from "@/lib/payment-verification-rules";
import { requireRole, writeBlock } from "@/lib/session";

export type ReviewResult = { ok: true } | { ok: false; error: string };

function refresh(retailerId: string) {
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
    return { ok: true };
  });
  if (res.ok) refresh(retailerId);
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

    const allocs = await tx.select().from(receiptAllocations).where(eq(receiptAllocations.receiptId, receiptId));
    const totals = new Map<string, number>();
    for (const a of allocs) totals.set(a.firmId, (totals.get(a.firmId) ?? 0) + a.amountPaise);
    const lines = [...totals].map(([firmId, amountPaise]) => ({ firmId, amountPaise }));

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
  if (res.ok) refresh(retailerId);
  return res;
}
