/**
 * Receipt rules as plain functions (no database) so they are easy to test.
 * Source: docs/idea.md section 6 (Payments) and section 5 (Retailer dues).
 *
 * Choices where the spec is silent:
 * - Money is integer paise. A receipt pays the retailer's one ledger: one `receipt_credit`
 *   row of minus the receipt total. Paying more than the dues is fine: the balance goes
 *   below zero (an advance) and later orders use it up.
 * - Cheque details required: number, date, bank name. Online: UTR / reference. Cash: nothing extra.
 * - Cheque lifecycle: pending -> cleared | bounced. Cleared and bounced are final.
 * - A bounce reverses the whole credit.
 */
export const PAYMENT_MODES = ["cash", "online", "cheque"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

/**
 * Every receipt status. Cash: received. Online: unverified -> verified.
 * Cheque: pending -> cleared | bounced. Any receipt can end as "reversed" (taken back by accounts).
 */
export const RECEIPT_STATUSES = [
  "received",
  "unverified",
  "verified",
  "pending",
  "cleared",
  "bounced",
  "reversed",
] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];

export const MODE_LABELS: Record<string, string> = { cash: "Cash", online: "Online", cheque: "Cheque" };

/** Status words and the colour group of the status chip (which only knows order colours). */
export function receiptChip(status: string): {
  status: "pending" | "approved" | "rejected" | "delivered";
  label: string;
} {
  switch (status) {
    case "received":
      return { status: "delivered", label: "Received" };
    case "unverified":
      return { status: "pending", label: "Not verified" };
    case "verified":
      return { status: "delivered", label: "Verified" };
    case "pending":
      return { status: "pending", label: "Cheque pending" };
    case "cleared":
      return { status: "delivered", label: "Cleared" };
    case "bounced":
      return { status: "rejected", label: "Bounced" };
    case "reversed":
      return { status: "rejected", label: "Reversed" };
    default:
      return { status: "pending", label: status };
  }
}

export type ModeDetails = {
  utr?: string | null;
  chequeNumber?: string | null;
  chequeDate?: string | null;
  bankName?: string | null;
};

export function validateModeDetails(mode: string, d: ModeDetails): string | null {
  const has = (v: string | null | undefined) => typeof v === "string" && v.trim().length > 0;
  if (mode === "cash") return null;
  if (mode === "online") {
    if (!has(d.utr)) return "Enter the UTR / reference number.";
    return null;
  }
  if (mode === "cheque") {
    if (!has(d.chequeNumber)) return "Enter the cheque number.";
    if (!has(d.chequeDate) || !/^\d{4}-\d{2}-\d{2}$/.test(d.chequeDate!.trim()))
      return "Enter the cheque date.";
    if (!has(d.bankName)) return "Enter the bank name.";
    return null;
  }
  return "Pick a payment mode: cash, online or cheque.";
}

/** Largest receipt we accept: ₹100 crore (a typo guard, not a real business limit). */
export const MAX_RECEIPT_PAISE = 100 * 1_00_00_000 * 100;

/** The receipt amount must be whole paise above zero (and not absurdly large). Returns an error or null. */
export function checkReceiptAmount(totalPaise: number): string | null {
  if (!Number.isSafeInteger(totalPaise) || totalPaise <= 0) return "Enter the amount received.";
  if (totalPaise > MAX_RECEIPT_PAISE) return "That amount is too large.";
  return null;
}

export type ChequeStatus = "pending" | "cleared" | "bounced";

export function canChangeChequeStatus(from: ChequeStatus, to: ChequeStatus): boolean {
  return from === "pending" && (to === "cleared" || to === "bounced");
}
