/**
 * Reversing a payment, as plain functions (no database) so they are easy to test.
 * Source: docs/idea.md section 6 ("A verified / recorded payment can be reversed by accounts or
 * admin with a reason (dues go back up; cash leaves the holder's balance if not yet handed over)")
 * and section 5 (append-only ledger: mistakes are fixed by a new reversing entry).
 *
 * - Who: accounts or admin (permissions.ts "reverseReceipt").
 * - Which: a "received" cash payment or a "verified" online payment. An unverified online
 *   payment is rejected instead (receipt-rules planReject); rejected and reversed are final.
 * - A reason code is required (payment list in reason-codes.ts; a note is optional, needed for
 *   "other"). Label and note go into the ledger note.
 * - Ledger: one compensating row of +amount (kind "receipt_reversal", with the payment's id), so the
 *   retailer owes that money again. Nothing posted before is edited. Reversals saved before this
 *   kind existed are "receipt_credit" rows with a + amount.
 * - Cash: accounts / admin say where that cash is now (owner's rule):
 *   - "Cash is still with <name>" ("holder"): it leaves that person's cash-held balance (one
 *     "reversed" wallet row). They must hold at least that much, and none of it may be promised in
 *     a handover request still waiting (answer the request first).
 *   - "Cash already handed to office" ("office"): no wallet row; the office already has the cash.
 *   Either way the dues go back up and the payment is marked reversed.
 */
import { can } from "./permissions";
import { formatINR } from "./money";
import { checkReason, reasonText, type PaymentReasonCode } from "./reason-codes";

export const REVERSIBLE_STATUSES = ["received", "verified"] as const;

export function isReversibleStatus(status: string): boolean {
  return (REVERSIBLE_STATUSES as readonly string[]).includes(status);
}

/** May this person reverse a payment in this status? */
export function canReverseReceipt(role: string | null | undefined, status: string): boolean {
  return can(role, "reverseReceipt") && isReversibleStatus(status);
}

/** Where the cash of a reversed cash payment is now. */
export const CASH_PLACES = ["holder", "office"] as const;
export type CashPlace = (typeof CASH_PLACES)[number];

export function isCashPlace(value: unknown): value is CashPlace {
  return typeof value === "string" && (CASH_PLACES as readonly string[]).includes(value);
}

export type ReversalPlan =
  | {
      ok: true;
      code: PaymentReasonCode;
      /** The typed note ("" when none), kept in reversal_reason. */
      reason: string;
      ledgerKind: "receipt_reversal";
      /** Signed ledger amount to post (+ = the retailer owes again). */
      ledgerPaise: number;
      /** Cash to take out of the recorder's cash-held balance (0 for online). */
      walletPaise: number;
      note: string;
    }
  | { ok: false; error: string };

/**
 * `cashPlace` says where a cash payment's money is now (ignored for online).
 * `holder` is the recorder's cash right now (needed for "holder"): `balancePaise` = cash held,
 * `availablePaise` = cash held minus handover requests still waiting.
 */
export function planReversal(
  role: string | null | undefined,
  receipt: { mode: string; status: string; receiptNo: number; totalPaise: number },
  reasonCode: unknown,
  note: unknown,
  cashPlace: unknown = null,
  holder: { balancePaise: number; availablePaise: number } = { balancePaise: 0, availablePaise: 0 },
): ReversalPlan {
  if (!can(role, "reverseReceipt")) return { ok: false, error: "Only accounts or admin can reverse a payment." };
  if (!isReversibleStatus(receipt.status)) {
    if (receipt.status === "unverified") return { ok: false, error: "Reject it instead: it is not verified yet." };
    return { ok: false, error: `A ${receipt.status} payment cannot be reversed.` };
  }
  const r = checkReason("payment", reasonCode, note);
  if (!r.ok) return r;
  if (!Number.isSafeInteger(receipt.totalPaise) || receipt.totalPaise <= 0) {
    return { ok: false, error: "This payment has nothing to reverse." };
  }
  const cash = receipt.mode === "cash";
  if (cash && !isCashPlace(cashPlace)) return { ok: false, error: "Pick where the cash is now." };
  const fromHolder = cash && cashPlace === "holder";
  if (fromHolder && holder.balancePaise < receipt.totalPaise) {
    return {
      ok: false,
      error: `They hold only ${formatINR(Math.max(0, holder.balancePaise))} now. If the cash went to the office, pick "Cash already handed to office".`,
    };
  }
  if (fromHolder && holder.availablePaise < receipt.totalPaise) {
    return { ok: false, error: "A handover of this cash is waiting. Confirm or reject it first." };
  }
  return {
    ok: true,
    code: r.code,
    reason: r.note,
    ledgerKind: "receipt_reversal",
    ledgerPaise: receipt.totalPaise,
    walletPaise: fromHolder ? receipt.totalPaise : 0,
    note: `Payment #${receipt.receiptNo} reversed: ${reasonText(r.code, r.note, "payment")}`,
  };
}
