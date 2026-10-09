/**
 * Reversing a receipt, as plain functions (no database) so they are easy to test.
 * Source: docs/idea.md section 6.1 ("Reversing a receipt reverses all its allocation
 * lines together") and section 7 ("no edits on posted entries, only reversals").
 *
 * Choices where the spec is silent:
 * - Who: accounts (admin passes), see permissions.ts "reverseReceipt".
 * - Which: received (cash), unverified / verified (online) and cleared (cheque).
 *   A pending cheque uses "Bounced" instead; bounced and reversed are final.
 * - A reason is required (trimmed, at most 300 characters). It goes into the ledger note.
 * - Ledger: one compensating row per firm line (+amount, kind "receipt_credit"), so the
 *   retailer owes that firm again. Nothing posted before is edited.
 * - Cash: the money leaves the collector's wallet with a "reversed" row per firm. If, for
 *   any firm, the collector's AVAILABLE cash (balance minus pending handovers) is less
 *   than that line, the reversal is refused: the cash was already handed over, so
 *   accounts must sort it out first.
 * - Online "Not received" on the review screen is the same reversal.
 */
import { can } from "@/lib/permissions";
import type { PostingLine } from "@/lib/receipt-rules";

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
      /** Signed ledger rows (+ = the retailer owes again), one per firm. */
      ledger: PostingLine[];
      /** Wallet rows for the collector (cash only). Amounts are positive sizes. */
      wallet: { firmId: string; kind: "reversed"; amountPaise: number }[];
      note: string;
    }
  | { ok: false; error: string };

/**
 * `lines` are the receipt's posting lines per firm (positive paise, allocation + advance).
 * `availableByFirm` is the collector's available wallet cash per firm (needed for cash).
 */
export function planReversal(
  role: string | null | undefined,
  receipt: { mode: string; status: string; receiptNo: number },
  lines: readonly PostingLine[],
  reason: unknown,
  availableByFirm: Readonly<Record<string, number>> = {},
): ReversalPlan {
  if (!can(role, "reverseReceipt")) return { ok: false, error: "Only accounts or admin can reverse a receipt." };
  if (!isReversibleStatus(receipt.status)) {
    if (receipt.status === "pending") return { ok: false, error: "Mark the cheque as bounced instead." };
    return { ok: false, error: `A ${receipt.status} receipt cannot be reversed.` };
  }
  const r = checkReversalReason(reason);
  if (!r.ok) return r;
  const positive = lines.filter((l) => l.amountPaise > 0);
  if (positive.length === 0) return { ok: false, error: "This receipt has nothing to reverse." };

  let wallet: { firmId: string; kind: "reversed"; amountPaise: number }[] = [];
  if (receipt.mode === "cash") {
    for (const l of positive) {
      if ((availableByFirm[l.firmId] ?? 0) < l.amountPaise)
        return {
          ok: false,
          error: "This cash was already handed over. Settle it with the collector first.",
        };
    }
    wallet = positive.map((l) => ({ firmId: l.firmId, kind: "reversed" as const, amountPaise: l.amountPaise }));
  }
  return {
    ok: true,
    reason: r.reason,
    ledger: positive.map((l) => ({ firmId: l.firmId, amountPaise: l.amountPaise })),
    wallet,
    note: `Receipt #${receipt.receiptNo} reversed: ${r.reason}`,
  };
}
