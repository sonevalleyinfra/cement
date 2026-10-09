import type { LedgerEntry } from "@/lib/ledger-rules";
import {
  firmLines,
  validateAllocation,
  validateModeDetails,
  type Advance,
  type Allocation,
  type ModeDetails,
  type OutstandingItem,
} from "@/lib/receipt-rules";

/**
 * Turns a receipt request into what must be saved, or an error.
 * Choices where the spec is silent:
 * - Cheques are saved as "pending" but the ledger is credited right away (spec 6.4:
 *   "on bounce, every allocation line reverses"). Cash and online are saved as "received".
 * - Ledger credit = one row per firm, negative signed paise (ledger convention).
 */
export type ReceiptRequest = {
  retailerId: string;
  mode: string;
  totalPaise: number;
  details: ModeDetails;
  allocations: Allocation[];
  advance: Advance | null;
};

export type ReceiptPlan =
  | {
      ok: true;
      status: "received" | "pending";
      /** Allocation rows to store (orders first, then the advance row). */
      rows: { firmId: string; orderId: string | null; amountPaise: number; advance: boolean }[];
      ledger: LedgerEntry[];
    }
  | { ok: false; error: string };

export function planReceipt(req: ReceiptRequest, outstanding: readonly OutstandingItem[]): ReceiptPlan {
  const modeError = validateModeDetails(req.mode, req.details);
  if (modeError) return { ok: false, error: modeError };
  const check = validateAllocation(req.totalPaise, req.allocations, outstanding, {
    retailerId: req.retailerId,
    advance: req.advance,
  });
  if (!check.ok) return { ok: false, error: check.error };

  const rows = req.allocations
    .filter((a) => a.amountPaise > 0)
    .map((a) => ({ firmId: a.firmId, orderId: a.orderId as string | null, amountPaise: a.amountPaise, advance: false }));
  if (req.advance && req.advance.amountPaise > 0) {
    rows.push({ firmId: req.advance.firmId, orderId: null, amountPaise: req.advance.amountPaise, advance: true });
  }
  const ledger: LedgerEntry[] = firmLines(req.allocations, req.advance).map((l) => ({
    firmId: l.firmId,
    retailerId: req.retailerId,
    kind: "receipt_credit",
    amountPaise: -l.amountPaise,
  }));
  return { ok: true, status: req.mode === "cheque" ? "pending" : "received", rows, ledger };
}
