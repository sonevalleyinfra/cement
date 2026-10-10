/**
 * Online verification and cheque clearing rules as plain functions (no database).
 * Source: docs/idea.md section 6 (Payments).
 *
 * Choices where the spec is silent:
 * - Online receipts start "unverified". Accounts or admin verify them by typing the UTR
 *   they see on the bank statement; it must match the one the collector recorded
 *   (ignoring case and spaces). Then the status becomes "verified". Verified is final.
 * - Cheques: pending -> cleared | bounced (see receipt-rules canChangeChequeStatus).
 *   A bounce adds one compensating ledger row that undoes the credit; nothing is edited.
 * - Online money that never arrived ("Not received") is a receipt reversal, see receipt-reversal.ts.
 */
import { hasAnyRole } from "@/lib/roles";
import { canChangeChequeStatus, type ChequeStatus } from "@/lib/receipt-rules";

export type Check = { ok: true } | { ok: false; error: string };

export function canVerifyPayments(role: string | null | undefined): boolean {
  return hasAnyRole(role, ["accounts"]);
}

export function normaliseUtr(utr: string | null | undefined): string {
  return (utr ?? "").replace(/\s+/g, "").toUpperCase();
}

export function checkOnlineVerification(
  role: string | null | undefined,
  receipt: { mode: string; status: string; utr: string | null },
  enteredUtr: string,
): Check {
  if (!canVerifyPayments(role)) return { ok: false, error: "Only accounts or admin can verify online payments." };
  if (receipt.mode !== "online") return { ok: false, error: "Only online receipts are verified." };
  if (receipt.status !== "unverified") return { ok: false, error: "This payment is already verified." };
  const entered = normaliseUtr(enteredUtr);
  if (!entered) return { ok: false, error: "Enter the UTR from the bank statement." };
  if (entered !== normaliseUtr(receipt.utr)) return { ok: false, error: "The UTR does not match the one recorded." };
  return { ok: true };
}

export type ChequeActionPlan =
  | {
      ok: true;
      status: ChequeStatus;
      /** Signed ledger amount to post (+ = the retailer owes again), 0 when nothing is posted. */
      ledgerPaise: number;
    }
  | { ok: false; error: string };

/** A bounce puts the whole cheque amount back on the retailer's dues; clearing posts nothing. */
export function planChequeAction(
  role: string | null | undefined,
  receipt: { mode: string; status: string; totalPaise: number },
  to: string,
): ChequeActionPlan {
  if (!canVerifyPayments(role)) return { ok: false, error: "Only accounts or admin can clear or bounce a cheque." };
  if (receipt.mode !== "cheque") return { ok: false, error: "This is not a cheque." };
  if (to !== "cleared" && to !== "bounced") return { ok: false, error: "Pick cleared or bounced." };
  if (!canChangeChequeStatus(receipt.status as ChequeStatus, to))
    return { ok: false, error: `A ${receipt.status} cheque cannot be marked ${to}.` };
  if (to === "cleared") return { ok: true, status: "cleared", ledgerPaise: 0 };
  // The receipt was credited as -total, so +total undoes it.
  return { ok: true, status: "bounced", ledgerPaise: receipt.totalPaise };
}
