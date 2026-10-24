/**
 * Credit terms of a shop: a limit (paise), credit days and a status. Plain functions: no database.
 * Approving an order checks them (v2 B1, credit-check-rules.ts): over the limit, overdue or a shop on
 * hold / blocked needs an override reason (soft block). Dispatch does not check them yet.
 */

import { formatINR, parseRupeesToPaise } from "./money";
import { CREDIT_STATUS_LABELS, isCreditStatus, type CreditStatus } from "./shop-lists";
import { daysText } from "./words";

/** The highest limit: ₹10 crore, in paise (a safe integer). */
export const CREDIT_LIMIT_MAX_PAISE = 10_000_000_000;
/** Credit days when none is set. */
export const DEFAULT_CREDIT_DAYS = 30;
export const CREDIT_DAYS_MAX = 365;
export const CREDIT_NOTE_MAX = 200;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** The limit typed in rupees → paise. Empty = no limit (null). */
export function parseCreditLimit(text: string): Result<number | null> {
  const t = text.trim();
  if (!t) return { ok: true, value: null };
  const paise = parseRupeesToPaise(t);
  if (paise === null) return { ok: false, error: "Enter the limit in rupees" };
  if (paise < 0) return { ok: false, error: "Limit can't be negative" };
  if (paise > CREDIT_LIMIT_MAX_PAISE) return { ok: false, error: "Limit is over ₹10 crore" };
  return { ok: true, value: paise };
}

/** A limit in paise as the text the limit field starts with ("" = no limit, "200000", "2000.50"). */
export function creditLimitText(paise: number | null): string {
  if (paise === null) return "";
  const rupees = Math.trunc(paise / 100);
  const rest = paise % 100;
  return rest ? `${rupees}.${String(rest).padStart(2, "0")}` : String(rupees);
}

/** Whole days 0..365. Empty = not set (null; the default of 30 applies). */
export function validateCreditDays(text: string): Result<number | null> {
  const t = text.trim();
  if (!t) return { ok: true, value: null };
  if (!/^\d+$/.test(t)) return { ok: false, error: "Enter whole credit days" };
  const days = Number(t);
  if (days > CREDIT_DAYS_MAX) return { ok: false, error: "Credit days must be 0 to 365" };
  return { ok: true, value: days };
}

/** The credit days that apply: the shop's own, or 30. */
export function effectiveCreditDays(days: number | null | undefined): number {
  return days ?? DEFAULT_CREDIT_DAYS;
}

export type CreditTerms = { limitPaise: number | null; creditDays: number | null; status: CreditStatus };

/** What the form sends for the credit part. */
export type CreditForm = { limit: string; days: string; status: string; note: string };

/** Cleans and checks the credit part. */
export function validateCredit(raw: Partial<CreditForm>): Result<CreditTerms & { note: string }> {
  const limit = parseCreditLimit(raw.limit ?? "");
  if (!limit.ok) return limit;
  const days = validateCreditDays(raw.days ?? "");
  if (!days.ok) return days;
  if (!isCreditStatus(raw.status)) return { ok: false, error: "Pick a credit status" };
  const note = (raw.note ?? "").trim().replace(/\s+/g, " ");
  if (note.length > CREDIT_NOTE_MAX) return { ok: false, error: "Note is too long" };
  return { ok: true, value: { limitPaise: limit.value, creditDays: days.value, status: raw.status, note } };
}

/** One row of the credit history (credit_limit_changes), without ids. */
export type CreditChange = {
  oldLimitPaise: number | null;
  newLimitPaise: number | null;
  oldCreditDays: number | null;
  newCreditDays: number | null;
  oldStatus: CreditStatus;
  newStatus: CreditStatus;
  note: string;
};

/**
 * The history row for a save, or null when limit, days and status all stayed the same.
 * null → null is no change; null → 30 IS a change (the shop now has its own days).
 */
export function creditChange(before: CreditTerms, after: CreditTerms, note = ""): CreditChange | null {
  if (
    before.limitPaise === after.limitPaise &&
    before.creditDays === after.creditDays &&
    before.status === after.status
  ) {
    return null;
  }
  return {
    oldLimitPaise: before.limitPaise,
    newLimitPaise: after.limitPaise,
    oldCreditDays: before.creditDays,
    newCreditDays: after.creditDays,
    oldStatus: before.status,
    newStatus: after.status,
    note,
  };
}

const limitWord = (p: number | null) => (p === null ? "No limit" : formatINR(p, { hidePaise: true }));
const daysWord = (d: number | null) => (d === null ? "Default" : daysText(d));
const statusWord = (s: string) => (isCreditStatus(s) ? CREDIT_STATUS_LABELS[s] : s);

/** The parts of a history row that changed: ["₹2,00,000 → ₹5,00,000", "30 → 45 days", "OK → On hold"] ("Default" = not set). */
export function creditChangeParts(c: {
  oldLimitPaise: number | null;
  newLimitPaise: number | null;
  oldCreditDays: number | null;
  newCreditDays: number | null;
  oldStatus: string;
  newStatus: string;
}): string[] {
  const parts: string[] = [];
  if (c.oldLimitPaise !== c.newLimitPaise) parts.push(`${limitWord(c.oldLimitPaise)} → ${limitWord(c.newLimitPaise)}`);
  if (c.oldCreditDays !== c.newCreditDays) {
    parts.push(
      c.oldCreditDays !== null && c.newCreditDays !== null
        ? `${c.oldCreditDays} → ${daysText(c.newCreditDays)}`
        : `${daysWord(c.oldCreditDays)} → ${daysWord(c.newCreditDays)}`,
    );
  }
  if (c.oldStatus !== c.newStatus) parts.push(`${statusWord(c.oldStatus)} → ${statusWord(c.newStatus)}`);
  return parts;
}
