import type { LedgerEntry } from "@/lib/ledger-rules";
import {
  firmLines,
  validateAllocation,
  validateModeDetails,
  type Advance,
  type Allocation,
  type FirmDue,
  type ModeDetails,
} from "@/lib/receipt-rules";

/**
 * Turns a receipt request into what must be saved, or an error.
 * Choices where the spec is silent:
 * - Cheques are saved as "pending" but the ledger is credited right away (spec 6.4:
 *   "on bounce, every allocation line reverses"). Cash is saved as "received"; online as "unverified" until accounts verify the UTR.
 * - Allocation rows: one per firm (no order, advance false), then the advance row.
 * - Ledger credit = one row per firm (allocation + advance together), negative signed paise (ledger convention).
 * - `dues` must be worked out by the server from the ledger, never taken from the browser.
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
      status: "received" | "pending" | "unverified";
      /** Allocation rows to store (firms first, then the advance row). */
      rows: { firmId: string; orderId: null; amountPaise: number; advance: boolean }[];
      /** One line per firm (positive paise): what the ledger and the wallet get. */
      lines: { firmId: string; amountPaise: number }[];
      ledger: LedgerEntry[];
    }
  | { ok: false; error: string };

export function planReceipt(req: ReceiptRequest, dues: readonly FirmDue[]): ReceiptPlan {
  const modeError = validateModeDetails(req.mode, req.details);
  if (modeError) return { ok: false, error: modeError };
  const check = validateAllocation(req.totalPaise, req.allocations, dues, req.advance);
  if (!check.ok) return { ok: false, error: check.error };

  const rows: { firmId: string; orderId: null; amountPaise: number; advance: boolean }[] = req.allocations
    .filter((a) => a.amountPaise > 0)
    .map((a) => ({ firmId: a.firmId, orderId: null, amountPaise: a.amountPaise, advance: false }));
  if (req.advance && req.advance.amountPaise > 0) {
    rows.push({ firmId: req.advance.firmId, orderId: null, amountPaise: req.advance.amountPaise, advance: true });
  }
  const lines = firmLines(req.allocations, req.advance);
  const ledger: LedgerEntry[] = lines.map((l) => ({
    firmId: l.firmId,
    retailerId: req.retailerId,
    kind: "receipt_credit",
    amountPaise: -l.amountPaise,
  }));
  return {
    ok: true,
    status: req.mode === "cheque" ? "pending" : req.mode === "online" ? "unverified" : "received",
    rows,
    lines,
    ledger,
  };
}
