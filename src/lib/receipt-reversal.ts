/**
 * Reversing a receipt, as plain functions (no database) so they are easy to test.
 * Source: docs/idea.md section 6 ("A verified / recorded payment can be reversed ... with a
 * reason") and section 5 (append-only ledger: mistakes are fixed by a new reversing entry).
 *
 * Choices where the spec is silent:
 * - Who: accounts (admin passes), see permissions.ts "reverseReceipt".
 * - Which: received (cash), unverified / verified (online) and cleared (cheque).
 *   A pending cheque uses "Bounced" instead; bounced and reversed are final.
 * - A reason is required (trimmed, at most 300 characters). It goes into the ledger note.
 * - Ledger: one compensating row of +amount (kind "receipt_credit"), so the retailer owes
 *   that money again. Nothing posted before is edited.
 * - Cash: the money leaves the collector's wallet with one "reversed" row. If the collector's
 *   AVAILABLE cash (balance minus pending handovers) is less than the receipt, the reversal
 *   is refused: the cash was already handed over, so accounts must sort it out first.
 * - Online "Not received" on the review screen is the same reversal.
 */
import { can } from "@/lib/permissions";

export const REVERSIBLE_STATUSES = ["received", "unverified", "verified", "cleared"] as const;
export const MAX_REVERSAL_REASON = 300;

export function isReversibleStatus(status: string): boolean {
  return (REVERSIBLE_STATUSES as readonly string[]).includes(status);
}

/** May this person reverse a receipt in this status? */
export function canReverseReceipt(role: string | null | undefined, status: string): boolean {
  return can(role, "reverseReceipt") && isReversibleStatus(status);
}

export function checkReversalReason(reason: unknown): { ok: true; reason: string } | { ok: false; error: string } {
  const clean = typeof reason === "string" ? reason.trim() : "";
  if (!clean) return { ok: false, error: "Enter the reason." };
  if (clean.length > MAX_REVERSAL_REASON) return { ok: false, error: `Keep the reason under ${MAX_REVERSAL_REASON} characters.` };
  return { ok: true, reason: clean };
}

export type ReversalPlan =
  | {
      ok: true;
      reason: string;
      /** Signed ledger amount to post (+ = the retailer owes again). */
      ledgerPaise: number;
      /** Cash to take out of the collector's wallet (0 for online and cheque). */
      walletPaise: number;
      note: string;
    }
  | { ok: false; error: string };

/**
 * `receipt.totalPaise` is what the receipt credited. `availablePaise` is the collector's
 * available wallet cash (needed for cash).
 */
export function planReversal(
  role: string | null | undefined,
  receipt: { mode: string; status: string; receiptNo: number; totalPaise: number },
  reason: unknown,
  availablePaise = 0,
): ReversalPlan {
  if (!can(role, "reverseReceipt")) return { ok: false, error: "Only accounts or admin can reverse a receipt." };
  if (!isReversibleStatus(receipt.status)) {
    if (receipt.status === "pending") return { ok: false, error: "Mark the cheque as bounced instead." };
    return { ok: false, error: `A ${receipt.status} receipt cannot be reversed.` };
  }
  const r = checkReversalReason(reason);
  if (!r.ok) return r;
  if (!Number.isSafeInteger(receipt.totalPaise) || receipt.totalPaise <= 0) {
    return { ok: false, error: "This receipt has nothing to reverse." };
  }
  const cash = receipt.mode === "cash";
  if (cash && availablePaise < receipt.totalPaise) {
    return { ok: false, error: "This cash was already handed over. Settle it with the collector first." };
  }
  return {
    ok: true,
    reason: r.reason,
    ledgerPaise: receipt.totalPaise,
    walletPaise: cash ? receipt.totalPaise : 0,
    note: `Receipt #${receipt.receiptNo} reversed: ${r.reason}`,
  };
}
