import type { LedgerEntry } from "@/lib/ledger-rules";
import { checkReceiptAmount, validateModeDetails, type ModeDetails } from "@/lib/receipt-rules";

/**
 * Turns a receipt request into what must be saved, or an error.
 * Choices where the spec is silent:
 * - Cheques are saved as "pending" but the ledger is credited right away (a bounce undoes it).
 *   Cash is saved as "received"; online as "unverified" until accounts verify the UTR.
 * - Ledger credit = one row of minus the whole amount (ledger convention: negative = the retailer owes less).
 *   Paying more than the dues leaves an advance (a negative balance).
 * - Cash goes into the collector's wallet (`walletPaise`); online and cheque money do not.
 */
export type ReceiptRequest = {
  retailerId: string;
  mode: string;
  totalPaise: number;
  details: ModeDetails;
};

export type ReceiptPlan =
  | {
      ok: true;
      status: "received" | "pending" | "unverified";
      ledger: LedgerEntry;
      /** Cash that goes into the collector's wallet (0 for online and cheque). */
      walletPaise: number;
    }
  | { ok: false; error: string };

export function planReceipt(req: ReceiptRequest): ReceiptPlan {
  const modeError = validateModeDetails(req.mode, req.details);
  if (modeError) return { ok: false, error: modeError };
  const amountError = checkReceiptAmount(req.totalPaise);
  if (amountError) return { ok: false, error: amountError };
  return {
    ok: true,
    status: req.mode === "cheque" ? "pending" : req.mode === "online" ? "unverified" : "received",
    ledger: { retailerId: req.retailerId, kind: "receipt_credit", amountPaise: -req.totalPaise },
    walletPaise: req.mode === "cash" ? req.totalPaise : 0,
  };
}
