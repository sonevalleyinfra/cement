/**
 * Retailer ledger rules as plain functions (no database) so they are easy to test.
 * Source: docs/idea.md section 5 (Retailer dues) and section 3 (Order flow).
 *
 * Choices where the spec is silent:
 * - Amounts are SIGNED integer paise: positive = debit (retailer owes), negative = credit.
 * - Each DISPATCH posts one debit (kind "order_debit"): the bags sent x the order's rate at
 *   that moment (spec 3.3). Approval posts nothing. So a rate change or a cancel only touches
 *   bags that were never billed, and needs no correcting entry.
 * - Entries are never edited; only new rows are added.
 * - One ledger per retailer. One opening balance per retailer. It may be negative (retailer has advance).
 * - Payments post a credit ("receipt_credit", minus the amount); a reversed payment posts the
 *   same kind with plus the amount. See receipt-rules.ts.
 * - Admin may add an adjustment (+ the retailer owes more, - owes less) with a reason, to fix
 *   anything else.
 * - Retailers can see their own ledger: their total dues, what came (no dispatch amounts) and their
 *   payments (ledger-view-rules.ts).
 */
import { checkReason } from "./receipt-rules";

export const LEDGER_KINDS = ["opening", "order_debit", "receipt_credit", "adjustment"] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export type LedgerEntry = {
  retailerId: string;
  kind: LedgerKind;
  /** Signed paise: + debit, - credit. */
  amountPaise: number;
  orderId?: string | null;
};

export type EntryResult = { ok: true; entry: LedgerEntry } | { ok: false; error: string };

/** Entries with the balance after each one, in the order given (oldest first). */
export function withRunningBalance<T extends { amountPaise: number }>(
  entries: readonly T[],
): (T & { balancePaise: number })[] {
  let sum = 0;
  return entries.map((e) => {
    sum += e.amountPaise;
    return { ...e, balancePaise: sum };
  });
}

export function sumPaise(entries: readonly { amountPaise: number }[]): number {
  return entries.reduce((n, e) => n + e.amountPaise, 0);
}

/** Balance of one retailer (positive = the retailer owes, negative = advance). */
export function balanceOf(entries: readonly { retailerId: string; amountPaise: number }[], retailerId: string): number {
  return sumPaise(entries.filter((e) => e.retailerId === retailerId));
}

/** What the retailer owes: only positive balances count as dues (an advance is not negative dues). */
export function duesFrom(balancePaise: number): number {
  return Math.max(0, balancePaise);
}

/** Order debit = bags x rate per bag, in paise. Needs whole bags >= 1 and a rate >= 1 paise. */
export function orderDebitPaise(bags: number, ratePaise: number | null | undefined): number | null {
  if (!Number.isInteger(bags) || bags < 1) return null;
  if (ratePaise == null || !Number.isInteger(ratePaise) || ratePaise < 1) return null;
  const total = bags * ratePaise;
  // Money columns are bigint, so the only limit is what JavaScript can count exactly.
  return Number.isSafeInteger(total) ? total : null;
}

/** Largest opening balance we accept: ₹100 crore (a typo guard, not a real business limit). */
export const MAX_OPENING_PAISE = 100 * 1_00_00_000 * 100;

/**
 * The debit entry for one dispatch: the bags sent x the rate they were sent at.
 * Linked to the order. One entry per dispatch.
 */
export function dispatchEntry(
  order: { id: string; retailerId: string },
  bags: number,
  ratePaise: number | null,
): EntryResult {
  const amount = orderDebitPaise(bags, ratePaise);
  if (amount === null) return { ok: false, error: "The dispatch needs bags and a rate before it can be billed." };
  return {
    ok: true,
    entry: { retailerId: order.retailerId, kind: "order_debit", amountPaise: amount, orderId: order.id },
  };
}

/** Opening balance: one per retailer. Zero is not allowed (nothing to record). */
export function openingEntry(
  existing: readonly { kind: string; retailerId: string }[],
  retailerId: string,
  amountPaise: number,
): EntryResult {
  if (!Number.isInteger(amountPaise) || amountPaise === 0) {
    return { ok: false, error: "Enter an amount in whole paise that is not zero." };
  }
  if (Math.abs(amountPaise) > MAX_OPENING_PAISE) return { ok: false, error: "That amount is too large." };
  if (existing.some((e) => e.kind === "opening" && e.retailerId === retailerId)) {
    return { ok: false, error: "Opening balance is already set for this retailer." };
  }
  return { ok: true, entry: { retailerId, kind: "opening", amountPaise } };
}

/** Admin's manual adjustment: signed, not zero, with a reason (stored as the ledger note). */
export function adjustmentEntry(
  retailerId: string,
  amountPaise: number,
  reason: unknown,
): { ok: true; entry: LedgerEntry; note: string } | { ok: false; error: string } {
  if (!Number.isSafeInteger(amountPaise) || amountPaise === 0) return { ok: false, error: "Enter the amount." };
  if (Math.abs(amountPaise) > MAX_OPENING_PAISE) return { ok: false, error: "That amount is too large." };
  const r = checkReason(reason);
  if (!r.ok) return r;
  return { ok: true, entry: { retailerId, kind: "adjustment", amountPaise }, note: r.reason };
}

/** Which roles may see all retailers' ledgers; a retailer sees only their own. */
export function canViewLedger(
  roles: { admin: boolean; accounts: boolean; sales: boolean; retailer: boolean },
  ownRetailerId: string | null,
  retailerId: string,
): boolean {
  if (roles.admin || roles.accounts || roles.sales) return true;
  return roles.retailer && ownRetailerId !== null && ownRetailerId === retailerId;
}
