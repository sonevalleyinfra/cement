/**
 * Prism account rules as plain functions (no database) so they are easy to test.
 * Source: docs/idea.md section 7 (Prism account).
 *
 * The Prism account is one append-only list of what the business owes Prism (the supplier).
 * Amounts are SIGNED integer paise: positive = we owe Prism more, negative = we owe less.
 * Balance = sum of the amounts. Rows are never edited or deleted; a mistake is fixed by an
 * adjustment with a reason.
 *
 * This file is also read by drizzle-kit (the schema uses the lists below), so it imports only
 * plain relative files (no "@/" paths).
 *
 * Choices where the spec is silent:
 * - Signs: opening is + (we owe) or - (Prism owes us); purchase is always +; payment and
 *   credit are always -; adjustment is + or -. No entry is ever zero.
 * - A purchase is bags x cost per bag. Cost per bag is whole paise, at least 1 paisa, at most
 *   ₹10,000 (a typo guard). Any amount above ₹100 crore is refused too.
 * - Every entry has an "entry date" (a calendar day in India, picked by the owner, today by
 *   default). It may be in the past but not in the future. Statements use this date.
 * - A payment has a mode (bank, cash or other). A bank payment needs a reference (UTR);
 *   cash and other may leave it empty.
 * - A credit (scheme / discount) and an adjustment need a reason, which is kept as the note.
 */
import { checkReason } from "./receipt-rules";

export const PRISM_KINDS = ["opening", "purchase", "payment", "credit", "adjustment"] as const;
export type PrismKind = (typeof PRISM_KINDS)[number];

export const PRISM_PAYMENT_MODES = ["bank", "cash", "other"] as const;
export type PrismPaymentMode = (typeof PRISM_PAYMENT_MODES)[number];

export const PRISM_MODE_LABELS: Record<PrismPaymentMode, string> = { bank: "Bank", cash: "Cash", other: "Other" };

const KIND_LABELS: Record<PrismKind, string> = {
  opening: "Opening balance",
  purchase: "Purchase",
  payment: "Payment",
  credit: "Credit",
  adjustment: "Adjustment",
};

/** The word shown for one entry. */
export function prismKindLabel(kind: string): string {
  return KIND_LABELS[kind as PrismKind] ?? kind;
}

/** Largest amount of one entry: ₹100 crore (a typo guard, not a real business limit). */
export const MAX_PRISM_PAISE = 100 * 1_00_00_000 * 100;
/** Largest cost per bag: ₹10,000 (a typo guard). */
export const MAX_COST_PER_BAG_PAISE = 10_000 * 100;
export const MAX_PRISM_REFERENCE = 60;
export const MAX_PRISM_NOTE = 300;

/** One Prism entry, ready to be saved (the database adds id, who and when). */
export type PrismEntry = {
  kind: PrismKind;
  /** Signed paise: + we owe Prism more, - we owe less. */
  amountPaise: number;
  /** The calendar day in India, "YYYY-MM-DD". */
  entryDate: string;
  /** Payments only. */
  mode: PrismPaymentMode | null;
  reference: string;
  note: string;
};

export type PrismResult = { ok: true; entry: PrismEntry } | { ok: false; error: string };

/** Balance = what we owe Prism (negative = Prism owes us). */
export function prismBalance(entries: readonly { amountPaise: number }[]): number {
  return entries.reduce((n, e) => n + e.amountPaise, 0);
}

/** The big line on the Prism page, from the balance. */
export function prismBalanceLabel(balancePaise: number): { text: string; amountPaise: number } {
  if (balancePaise > 0) return { text: "You owe Prism", amountPaise: balancePaise };
  if (balancePaise < 0) return { text: "Prism owes you", amountPaise: -balancePaise };
  return { text: "All settled", amountPaise: 0 };
}

/** A real calendar day "YYYY-MM-DD", not after `today` (also "YYYY-MM-DD"), not before 2000. */
export function checkEntryDate(
  input: unknown,
  today: string,
): { ok: true; date: string } | { ok: false; error: string } {
  const text = typeof input === "string" ? input.trim() : "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return { ok: false, error: "Pick a date." };
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const real = new Date(Date.UTC(year, month - 1, day));
  const isReal = real.getUTCFullYear() === year && real.getUTCMonth() === month - 1 && real.getUTCDate() === day;
  if (!isReal || year < 2000) return { ok: false, error: "Pick a real date." };
  if (text > today) return { ok: false, error: "The date cannot be in the future." };
  return { ok: true, date: text };
}

/** Cost per bag typed by the admin, in paise: whole paise, 1 paisa to ₹10,000. */
export function checkCostPerBag(costPaise: unknown): { ok: true; costPaise: number } | { ok: false; error: string } {
  if (typeof costPaise !== "number" || !Number.isSafeInteger(costPaise) || costPaise < 1) {
    return { ok: false, error: "Enter the cost per bag." };
  }
  if (costPaise > MAX_COST_PER_BAG_PAISE) return { ok: false, error: "That cost per bag is too high." };
  return { ok: true, costPaise };
}

/** Purchase amount = bags x cost per bag. Null when either is not a whole number >= 1, or the total is too big. */
export function purchaseAmountPaise(bags: number, costPerBagPaise: number): number | null {
  if (!Number.isInteger(bags) || bags < 1) return null;
  if (!Number.isInteger(costPerBagPaise) || costPerBagPaise < 1) return null;
  const total = bags * costPerBagPaise;
  return Number.isSafeInteger(total) && total <= MAX_PRISM_PAISE ? total : null;
}

/** A positive amount in paise, within the limit. */
function checkAmount(amountPaise: unknown): { ok: true; paise: number } | { ok: false; error: string } {
  if (typeof amountPaise !== "number" || !Number.isSafeInteger(amountPaise) || amountPaise === 0) {
    return { ok: false, error: "Enter the amount." };
  }
  if (Math.abs(amountPaise) > MAX_PRISM_PAISE) return { ok: false, error: "That amount is too large." };
  return { ok: true, paise: amountPaise };
}

function cleanText(text: unknown, max: number): string {
  return typeof text === "string" ? text.trim().slice(0, max) : "";
}

/**
 * Opening balance, once. `amountPaise` is signed: + we owe Prism, - Prism owes us.
 * `existing` are the kinds already in the account.
 */
export function openingEntry(
  existing: readonly { kind: string }[],
  amountPaise: unknown,
  entryDate: string,
): PrismResult {
  const a = checkAmount(amountPaise);
  if (!a.ok) return a;
  if (existing.some((e) => e.kind === "opening")) {
    return { ok: false, error: "Opening balance is already set." };
  }
  return {
    ok: true,
    entry: { kind: "opening", amountPaise: a.paise, entryDate, mode: null, reference: "", note: "Opening balance" },
  };
}

/** A purchase: + bags x cost per bag. `description` is shown as the note, e.g. "100 bags OPC 43". */
export function purchaseEntry(
  bags: number,
  costPerBagPaise: unknown,
  entryDate: string,
  extra: { reference?: unknown; description?: string } = {},
): PrismResult {
  const cost = checkCostPerBag(costPerBagPaise);
  if (!cost.ok) return cost;
  const amount = purchaseAmountPaise(bags, cost.costPaise);
  if (amount === null) return { ok: false, error: "That purchase is too large." };
  const note = extra.description ?? `${bags} bags`;
  return {
    ok: true,
    entry: {
      kind: "purchase",
      amountPaise: amount,
      entryDate,
      mode: null,
      reference: cleanText(extra.reference, MAX_PRISM_REFERENCE),
      note: note.slice(0, MAX_PRISM_NOTE),
    },
  };
}

/** Payment to Prism: - the amount. `amountPaise` is typed as a positive amount. */
export function paymentEntry(
  amountPaise: unknown,
  mode: unknown,
  reference: unknown,
  entryDate: string,
): PrismResult {
  const a = checkAmount(amountPaise);
  if (!a.ok) return a;
  if (a.paise < 0) return { ok: false, error: "Enter the amount." };
  if (typeof mode !== "string" || !(PRISM_PAYMENT_MODES as readonly string[]).includes(mode)) {
    return { ok: false, error: "Pick bank, cash or other." };
  }
  const ref = cleanText(reference, MAX_PRISM_REFERENCE + 1);
  if (ref.length > MAX_PRISM_REFERENCE) return { ok: false, error: "That reference is too long." };
  if (mode === "bank" && !ref) return { ok: false, error: "Enter the bank reference (UTR)." };
  return {
    ok: true,
    entry: {
      kind: "payment",
      amountPaise: -a.paise,
      entryDate,
      mode: mode as PrismPaymentMode,
      reference: ref,
      note: "",
    },
  };
}

/** Scheme / discount credit: - the amount, reason required. */
export function creditEntry(amountPaise: unknown, reason: unknown, entryDate: string): PrismResult {
  const a = checkAmount(amountPaise);
  if (!a.ok) return a;
  if (a.paise < 0) return { ok: false, error: "Enter the amount." };
  const r = checkReason(reason);
  if (!r.ok) return r;
  return {
    ok: true,
    entry: { kind: "credit", amountPaise: -a.paise, entryDate, mode: null, reference: "", note: r.reason },
  };
}

/** Admin's fix: signed (+ we owe more, - we owe less), reason required. */
export function adjustmentEntry(amountPaise: unknown, reason: unknown, entryDate: string): PrismResult {
  const a = checkAmount(amountPaise);
  if (!a.ok) return a;
  const r = checkReason(reason);
  if (!r.ok) return r;
  return {
    ok: true,
    entry: { kind: "adjustment", amountPaise: a.paise, entryDate, mode: null, reference: "", note: r.reason },
  };
}
