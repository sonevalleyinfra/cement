import { isRetailerOnly } from "./order-access";

/**
 * Ledger notes are written for staff (for example "Rate edited: <reason>").
 * A shop owner who only has the retailer role sees the kind, date, amount and balance only.
 */
export function showLedgerNotes(role: string | null | undefined): boolean {
  return !isRetailerOnly(role);
}
