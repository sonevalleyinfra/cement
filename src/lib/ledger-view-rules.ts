import { isRetailerOnly } from "./roles";

/**
 * Ledger notes are written for staff (for example "40 bags in BR01AB1234").
 * A shop owner who only has the retailer role sees the kind, date, amount and balance only.
 */
export function showLedgerNotes(role: string | null | undefined): boolean {
  return !isRetailerOnly(role);
}

const KIND_LABELS: Record<string, string> = {
  opening: "Opening balance",
  order_debit: "Dispatch",
  receipt_credit: "Payment",
  adjustment: "Adjustment",
};

/**
 * The word shown for one ledger row. A payment is a credit (negative). A positive
 * `receipt_credit` row puts a payment back on the bill (cheque bounced or receipt
 * reversed), so it reads "Payment reversed", not "Payment".
 */
export function ledgerEntryLabel(kind: string, amountPaise: number): string {
  if (kind === "receipt_credit" && amountPaise > 0) return "Payment reversed";
  return KIND_LABELS[kind] ?? kind;
}
