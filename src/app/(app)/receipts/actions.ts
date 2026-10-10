"use server";

import { and, eq, notInArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { receipts, retailers, user, walletMovements } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { isUniqueViolation } from "@/lib/db-errors";
import { saveOnce } from "@/lib/form-submissions";
import { isUuid } from "@/lib/ids";
import { getBalance, postEntry, type DbOrTx } from "@/lib/ledger";
import { duesFrom } from "@/lib/ledger-rules";
import { notifyMoney } from "@/lib/notify";
import { rolesFor } from "@/lib/permissions";
import { planReversal } from "@/lib/receipt-reversal";
import {
  isUtrTaken,
  PAYMENT_MODES,
  planReceipt,
  planReject,
  planVerify,
  UTR_FREED_STATUSES,
  UTR_TAKEN,
} from "@/lib/receipt-rules";
import { checkRequestId } from "@/lib/request-rules";
import { requireRole } from "@/lib/session";
import { walletBalance } from "@/lib/wallet-rules";

export type DuesResult = { ok: true; duesPaise: number } | { ok: false; error: string };
export type SaveReceiptResult = { ok: true; id: string } | { ok: false; error: string };
export type PaymentResult = { ok: true } | { ok: false; error: string };

/** What one retailer owes right now (from the ledger; an advance counts as 0). */
export async function loadDues(retailerId: string): Promise<DuesResult> {
  await requireRole(...rolesFor("recordReceipt"));
  if (!isUuid(retailerId)) return { ok: false, error: "Retailer not found." };
  return { ok: true, duesPaise: duesFrom(await getBalance(retailerId)) };
}

function refresh(retailerId: string, receiptId?: string) {
  revalidatePath("/receipts");
  revalidatePath("/receipts/review");
  if (receiptId) revalidatePath(`/receipts/${receiptId}`);
  revalidatePath("/wallet");
  revalidatePath("/ledger");
  revalidatePath(`/ledger/${retailerId}`);
  revalidatePath("/dashboard");
}

/** The facts every payment row in the activity log carries. */
function paymentFacts(r: { receiptNo: number; retailerId: string; mode: string; totalPaise: number; receivedBy: string; utr: string | null }) {
  return {
    receiptNo: r.receiptNo,
    retailerId: r.retailerId,
    mode: r.mode,
    amountPaise: r.totalPaise,
    collectorId: r.receivedBy,
    ...(r.utr ? { utr: r.utr } : {}),
  };
}

/** Locks one retailer row (same lock order everywhere: payment, then retailer, then staff member). */
async function lockRetailer(tx: DbOrTx, retailerId: string) {
  const [retailer] = await tx
    .select({ id: retailers.id, name: retailers.name })
    .from(retailers)
    .where(eq(retailers.id, retailerId))
    .for("no key update");
  return retailer ?? null;
}

/**
 * Records one payment from a retailer. Any staff member may.
 * Cash: the ledger credit (dues go down now) and the cash held by the recorder, in one transaction.
 * Online: saved as unverified with its UTR (dues unchanged); accounts are told.
 * `requestId` is the form's one-time id: a second tap gives the first payment back (request-rules.ts).
 */
export async function saveReceipt(input: {
  retailerId: string;
  mode: string;
  totalPaise: number;
  utr?: string;
  note?: string;
  requestId: string;
}): Promise<SaveReceiptResult> {
  const session = await requireRole(...rolesFor("recordReceipt"));
  const request = checkRequestId(input.requestId);
  if (!request.ok) return request;
  if (!isUuid(input.retailerId)) return { ok: false, error: "Retailer not found." };
  if (!(PAYMENT_MODES as readonly string[]).includes(input.mode)) return { ok: false, error: "Pick cash or online." };
  if (typeof input.totalPaise !== "number") return { ok: false, error: "Enter the amount received." };
  const plan = planReceipt({
    retailerId: input.retailerId,
    mode: input.mode,
    totalPaise: input.totalPaise,
    utr: typeof input.utr === "string" ? input.utr : null,
    note: input.mode === "online" && typeof input.note === "string" ? input.note : null,
  });
  if (!plan.ok) return plan;

  try {
    const res = await saveOnce({ id: request.id, kind: "payment", actorId: session.user.id }, async (tx) => {
      const retailer = await lockRetailer(tx, input.retailerId);
      if (!retailer) return { ok: false, error: "Retailer not found." };
      if (plan.utr) {
        const same = await tx
          .select({ mode: receipts.mode, status: receipts.status, utr: receipts.utr })
          .from(receipts)
          .where(and(eq(receipts.utr, plan.utr), notInArray(receipts.status, [...UTR_FREED_STATUSES])));
        if (isUtrTaken(plan.utr, same)) return { ok: false, error: UTR_TAKEN };
      }

      const [receipt] = await tx
        .insert(receipts)
        .values({
          retailerId: input.retailerId,
          mode: input.mode,
          totalPaise: input.totalPaise,
          utr: plan.utr,
          note: plan.note,
          status: plan.status,
          receivedBy: session.user.id,
        })
        .returning({ id: receipts.id, receiptNo: receipts.receiptNo });
      if (plan.ledger) await postEntry(tx, plan.ledger, session.user.id, `Payment #${receipt.receiptNo}`, receipt.id);
      await writeAudit(tx, {
        actorId: session.user.id,
        entity: "payment",
        entityId: receipt.id,
        action: "record",
        details: {
          receiptNo: receipt.receiptNo,
          retailerId: input.retailerId,
          mode: input.mode,
          amountPaise: input.totalPaise,
          ...(plan.utr ? { utr: plan.utr } : {}),
        },
      });
      if (plan.walletPaise > 0) {
        await tx.insert(walletMovements).values({
          collectorId: session.user.id,
          kind: "collected",
          amountPaise: plan.walletPaise,
          receiptId: receipt.id,
          actorId: session.user.id,
        });
      }
      if (input.mode === "cash") {
        // Admins hear about every cash payment (spec section 8); the person who recorded it is never told.
        await notifyMoney(tx, {
          event: "cash_recorded",
          retailerName: retailer.name,
          amountPaise: input.totalPaise,
          actorId: session.user.id,
          collectorId: session.user.id,
          link: `/receipts/${receipt.id}`,
        });
      }
      if (plan.status === "unverified") {
        await notifyMoney(tx, {
          event: "online_recorded",
          retailerName: retailer.name,
          amountPaise: input.totalPaise,
          actorId: session.user.id,
          link: `/receipts/${receipt.id}`,
        });
      }
      return { ok: true, resultId: receipt.id };
    });
    if (!res.ok) return res;
    refresh(input.retailerId, res.resultId);
    return { ok: true, id: res.resultId };
  } catch (error) {
    // Two people saving the same UTR at the same moment: the database rule stops the second.
    if (isUniqueViolation(error, "receipts_utr_unique_idx")) return { ok: false, error: UTR_TAKEN };
    throw error;
  }
}

/** Accounts / admin tap "Verified" on an online payment: the dues go down now. */
export async function verifyOnline(receiptId: string): Promise<PaymentResult> {
  const session = await requireRole(...rolesFor("verifyPayments"));
  if (!isUuid(receiptId)) return { ok: false, error: "Payment not found." };
  let retailerId = "";
  const res = await db.transaction(async (tx): Promise<PaymentResult> => {
    const [receipt] = await tx.select().from(receipts).where(eq(receipts.id, receiptId)).for("no key update");
    if (!receipt) return { ok: false, error: "Payment not found." };
    retailerId = receipt.retailerId;
    const retailer = await lockRetailer(tx, receipt.retailerId);
    const plan = planVerify(session.user.role, receipt);
    if (!plan.ok) return plan;
    await postEntry(tx, plan.ledger, session.user.id, `Payment #${receipt.receiptNo} (online)`, receipt.id);
    const now = new Date();
    await tx
      .update(receipts)
      .set({ status: "verified", checkedBy: session.user.id, checkedAt: now, updatedAt: now })
      .where(eq(receipts.id, receiptId));
    await writeAudit(tx, { actorId: session.user.id, entity: "payment", entityId: receipt.id, action: "verify", details: paymentFacts(receipt) });
    await notifyMoney(tx, {
      event: "online_verified",
      retailerName: retailer?.name ?? null,
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

/** Accounts / admin reject an online payment that never arrived (reason required). Dues unchanged. */
export async function rejectOnline(receiptId: string, reason: string): Promise<PaymentResult> {
  const session = await requireRole(...rolesFor("verifyPayments"));
  if (!isUuid(receiptId)) return { ok: false, error: "Payment not found." };
  let retailerId = "";
  const res = await db.transaction(async (tx): Promise<PaymentResult> => {
    const [receipt] = await tx.select().from(receipts).where(eq(receipts.id, receiptId)).for("no key update");
    if (!receipt) return { ok: false, error: "Payment not found." };
    retailerId = receipt.retailerId;
    const plan = planReject(session.user.role, receipt, reason);
    if (!plan.ok) return plan;
    const now = new Date();
    await tx
      .update(receipts)
      .set({ status: "rejected", checkedBy: session.user.id, checkedAt: now, rejectReason: plan.reason, updatedAt: now })
      .where(eq(receipts.id, receiptId));
    await writeAudit(tx, {
      actorId: session.user.id,
      entity: "payment",
      entityId: receipt.id,
      action: "reject",
      details: { ...paymentFacts(receipt), reason: plan.reason },
    });
    const [shop] = await tx.select({ name: retailers.name }).from(retailers).where(eq(retailers.id, receipt.retailerId));
    await notifyMoney(tx, {
      event: "online_rejected",
      retailerName: shop?.name ?? null,
      amountPaise: receipt.totalPaise,
      actorId: session.user.id,
      collectorId: receipt.receivedBy,
      link: `/receipts/${receipt.id}`,
      reason: plan.reason,
    });
    return { ok: true };
  });
  if (res.ok) refresh(retailerId, receiptId);
  return res;
}

/**
 * Reverses a received cash or verified online payment. Accounts / admin only, reason required.
 * For cash, `cashPlace` says where the cash is now: "holder" (still with the person who recorded it:
 * it leaves their cash held) or "office" (already handed over: nobody's cash held changes).
 * Locks the payment, then the retailer, then (cash) the recorder, so it cannot race a new
 * payment, a verification or a handover request.
 */
export async function reverseReceipt(receiptId: string, reason: string, cashPlace?: string): Promise<PaymentResult> {
  const session = await requireRole(...rolesFor("reverseReceipt"));
  if (!isUuid(receiptId)) return { ok: false, error: "Payment not found." };
  let retailerId = "";
  const res = await db.transaction(async (tx): Promise<PaymentResult> => {
    const [receipt] = await tx.select().from(receipts).where(eq(receipts.id, receiptId)).for("no key update");
    if (!receipt) return { ok: false, error: "Payment not found." };
    retailerId = receipt.retailerId;
    const retailer = await lockRetailer(tx, receipt.retailerId);
    if (!retailer) return { ok: false, error: "Retailer not found." };

    let holder = { balancePaise: 0, availablePaise: 0 };
    if (receipt.mode === "cash") {
      // Lock the recorder (like a handover request) so the cash cannot be handed over meanwhile.
      await tx.select({ id: user.id }).from(user).where(eq(user.id, receipt.receivedBy)).for("no key update");
      const moves = await tx.select().from(walletMovements).where(eq(walletMovements.collectorId, receipt.receivedBy));
      holder = walletBalance(moves);
    }

    const plan = planReversal(session.user.role, receipt, reason, cashPlace ?? null, holder);
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
    await writeAudit(tx, {
      actorId: session.user.id,
      entity: "payment",
      entityId: receipt.id,
      action: "reverse",
      details: {
        ...paymentFacts(receipt),
        reason: plan.reason,
        ...(receipt.mode === "cash" ? { cashWith: plan.walletPaise > 0 ? "holder" : "office" } : {}),
      },
    });
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
  if (res.ok) refresh(retailerId, receiptId);
  return res;
}
