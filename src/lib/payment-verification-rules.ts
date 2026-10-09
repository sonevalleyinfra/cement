/**
 * Online verification and cheque clearing rules as plain functions (no database).
 * Source: docs/idea.md sections 6.3 (Online) and 6.4 (Cheque).
 *
 * Choices where the spec is silent:
 * - Online receipts start "unverified". Accounts or admin verify them by typing the UTR
 *   they see on the bank statement; it must match the one the collector recorded
 *   (ignoring case and spaces). Then the status becomes "verified". Verified is final.
 * - Cheques: pending -> cleared | bounced (see receipt-rules canChangeChequeStatus).
 *   A bounce adds compensating ledger rows that undo every credit line; nothing is edited.
 */
import { hasAnyRole } from "@/lib/roles";
import { bounceReversal, canChangeChequeStatus, type ChequeStatus, type PostingLine } from "@/lib/receipt-rules";

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
  | { ok: true; status: ChequeStatus; ledgerLines: PostingLine[] }
  | { ok: false; error: string };

/**
 * `lines` are the receipt's posting lines per firm (positive paise). A bounce returns
 * ledger lines as signed ledger amounts (positive = the retailer owes again).
 */
export function planChequeAction(
  role: string | null | undefined,
  receipt: { mode: string; status: string },
  to: string,
  lines: readonly PostingLine[],
): ChequeActionPlan {
  if (!canVerifyPayments(role)) return { ok: false, error: "Only accounts or admin can clear or bounce a cheque." };
  if (receipt.mode !== "cheque") return { ok: false, error: "This is not a cheque." };
  if (to !== "cleared" && to !== "bounced") return { ok: false, error: "Pick cleared or bounced." };
  if (!canChangeChequeStatus(receipt.status as ChequeStatus, to))
    return { ok: false, error: `A ${receipt.status} cheque cannot be marked ${to}.` };
  if (to === "cleared") return { ok: true, status: "cleared", ledgerLines: [] };
  // Reversal lines are negative of the credit lines; the ledger stores credits as negatives,
  // so the compensating ledger amount is the opposite sign of the reversal line.
  const ledgerLines = bounceReversal(lines).map((l) => ({ firmId: l.firmId, amountPaise: -l.amountPaise }));
  return { ok: true, status: "bounced", ledgerLines };
}
