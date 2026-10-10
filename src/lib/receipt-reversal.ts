/**
 * Reversing a payment, as plain functions (no database) so they are easy to test.
 * Source: docs/idea.md section 6 ("A verified / recorded payment can be reversed by accounts or
 * admin with a reason (dues go back up; cash leaves the holder's balance if not yet handed over)")
 * and section 5 (append-only ledger: mistakes are fixed by a new reversing entry).
 *
 * - Who: accounts or admin (permissions.ts "reverseReceipt").
 * - Which: a "received" cash payment or a "verified" online payment. An unverified online
 *   payment is rejected instead (receipt-rules planReject); rejected and reversed are final.
 * - A reason is required (trimmed, at most 300 characters). It goes into the ledger note.
 * - Ledger: one compensating row of +amount (kind "receipt_credit"), so the retailer owes
 *   that money again. Nothing posted before is edited.
 * - Cash: the money leaves the recorder's cash-held balance (one "reversed" wallet row). Only
 *   allowed while they still hold that much. If they already handed it over, the reversal is
 *   refused and admin fixes the dues with a ledger adjustment. If a handover request is waiting
 *   for that cash, accounts answer the request first.
 */
import { can } from "./permissions";
import { checkReason } from "./receipt-rules";

export const REVERSIBLE_STATUSES = ["received", "verified"] as const;

export function isReversibleStatus(status: string): boolean {
  return (REVERSIBLE_STATUSES as readonly string[]).includes(status);
}

/** May this person reverse a payment in this status? */
export function canReverseReceipt(role: string | null | undefined, status: string): boolean {
  return can(role, "reverseReceipt") && isReversibleStatus(status);
}

export const CASH_HANDED_OVER =
  "This cash was already handed over, so it cannot be reversed. Ask admin to add a ledger adjustment instead.";

export type ReversalPlan =
  | {
      ok: true;
      reason: string;
      /** Signed ledger amount to post (+ = the retailer owes again). */
      ledgerPaise: number;
      /** Cash to take out of the recorder's cash-held balance (0 for online). */
      walletPaise: number;
      note: string;
    }
  | { ok: false; error: string };

/**
 * `holder` is the recorder's cash right now (needed for cash): `balancePaise` = cash held,
 * `availablePaise` = cash held minus handover requests still waiting.
 */
export function planReversal(
  role: string | null | undefined,
  receipt: { mode: string; status: string; receiptNo: number; totalPaise: number },
  reason: unknown,
  holder: { balancePaise: number; availablePaise: number } = { balancePaise: 0, availablePaise: 0 },
): ReversalPlan {
  if (!can(role, "reverseReceipt")) return { ok: false, error: "Only accounts or admin can reverse a payment." };
  if (!isReversibleStatus(receipt.status)) {
    if (receipt.status === "unverified") return { ok: false, error: "Reject it instead: it is not verified yet." };
    return { ok: false, error: `A ${receipt.status} payment cannot be reversed.` };
  }
  const r = checkReason(reason);
  if (!r.ok) return r;
  if (!Number.isSafeInteger(receipt.totalPaise) || receipt.totalPaise <= 0) {
    return { ok: false, error: "This payment has nothing to reverse." };
  }
  const cash = receipt.mode === "cash";
  if (cash && holder.balancePaise < receipt.totalPaise) return { ok: false, error: CASH_HANDED_OVER };
  if (cash && holder.availablePaise < receipt.totalPaise) {
    return { ok: false, error: "A handover of this cash is waiting. Confirm or reject it first." };
  }
  return {
    ok: true,
    reason: r.reason,
    ledgerPaise: receipt.totalPaise,
    walletPaise: cash ? receipt.totalPaise : 0,
    note: `Payment #${receipt.receiptNo} reversed: ${r.reason}`,
  };
}
