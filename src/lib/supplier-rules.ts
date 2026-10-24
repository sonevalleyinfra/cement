/**
 * Supplier account rules as plain functions (no database) so they are easy to test.
 * Source: docs/idea.md section 7 (Supplier accounts, one per brand).
 *
 * Each brand is bought from its own company, so each brand has its own supplier account
 * ("Prism account", later e.g. "UltraTech account"). Every entry belongs to one brand.
 * An account is an append-only list of what the business owes that supplier.
 * Amounts are SIGNED integer paise: positive = we owe the supplier more, negative = we owe less.
 * Balance of a brand = sum of that brand's amounts. Rows are never edited or deleted; a mistake
 * is fixed by an adjustment with a reason.
 *
 * This file is also read by drizzle-kit (the schema uses the lists below), so it imports only
 * plain relative files (no "@/" paths).
 *
 * Choices where the spec is silent:
 * - Signs: opening is + (we owe) or - (the supplier owes us); purchase is always +; payment and
 *   credit are always -; adjustment is + or -. No entry is ever zero.
 * - One opening balance per brand.
 * - A purchase goes to the account of the purchased product's brand.
 * - A purchase is bags x cost per bag. Cost per bag is whole paise, at least 1 paisa, at most
 *   ₹10,000 (a typo guard). Any amount above ₹100 crore is refused too.
 * - Every entry has an "entry date" (a calendar day in India, picked by the owner, today by
 *   default). It may be in the past but not in the future. Statements use this date.
 * - A payment has a mode (bank, cash or other). A bank payment needs a reference (UTR);
 *   cash and other may leave it empty.
 * - A credit (scheme / discount) and an adjustment need a reason, which is kept as the note.
 * - The suppliers list shows every switched-on brand, plus a switched-off brand that still has
 *   entries (so its balance is never hidden).
 */
import { checkReason } from "./receipt-rules";

/**
 * `purchase_reversal` (v2 B2): an admin reversed (part of) a purchase; always -, bags x the purchase's
 * invoice cost per bag, linked to the purchase_reversal stock movement (lib/reversals.ts).
 */
export const SUPPLIER_KINDS = ["opening", "purchase", "payment", "credit", "adjustment", "purchase_reversal"] as const;
export type SupplierKind = (typeof SUPPLIER_KINDS)[number];

export const SUPPLIER_PAYMENT_MODES = ["bank", "cash", "other"] as const;
export type SupplierPaymentMode = (typeof SUPPLIER_PAYMENT_MODES)[number];

export const SUPPLIER_MODE_LABELS: Record<SupplierPaymentMode, string> = { bank: "Bank", cash: "Cash", other: "Other" };

const KIND_LABELS: Record<SupplierKind, string> = {
  opening: "Opening balance",
  purchase: "Purchase",
  payment: "Payment",
  credit: "Credit",
  adjustment: "Adjustment",
  purchase_reversal: "Purchase reversed",
};

/** The word shown for one entry. */
export function supplierKindLabel(kind: string): string {
  return KIND_LABELS[kind as SupplierKind] ?? kind;
}

/** Largest amount of one entry: ₹100 crore (a typo guard, not a real business limit). */
export const MAX_SUPPLIER_PAISE = 100 * 1_00_00_000 * 100;
/** Largest cost per bag: ₹10,000 (a typo guard). */
export const MAX_COST_PER_BAG_PAISE = 10_000 * 100;
export const MAX_SUPPLIER_REFERENCE = 60;
export const MAX_SUPPLIER_NOTE = 300;

/** One supplier entry, ready to be saved (the database adds id, who and when). */
export type SupplierEntry = {
  /** The brand whose supplier this is. */
  brandId: string;
  kind: SupplierKind;
  /** Signed paise: + we owe the supplier more, - we owe less. */
  amountPaise: number;
  /** The calendar day in India, "YYYY-MM-DD". */
  entryDate: string;
  /** Payments only. */
  mode: SupplierPaymentMode | null;
  reference: string;
  note: string;
};

export type SupplierResult = { ok: true; entry: SupplierEntry } | { ok: false; error: string };


/** Every brand's balance at once: brand id → signed paise. Brands with no entries are left out. */
export function balancesByBrand(entries: readonly { brandId: string; amountPaise: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries) out.set(e.brandId, (out.get(e.brandId) ?? 0) + e.amountPaise);
  return out;
}

/** The big line for one supplier: "You owe Prism" / "Prism owes you" / "Prism settled". */
export function supplierBalanceLabel(brandName: string, balancePaise: number): { text: string; amountPaise: number } {
  if (balancePaise > 0) return { text: `You owe ${brandName}`, amountPaise: balancePaise };
  if (balancePaise < 0) return { text: `${brandName} owes you`, amountPaise: -balancePaise };
  return { text: `${brandName} settled`, amountPaise: 0 };
}

/** Most suppliers shown one by one on the admin home; with more, the home shows their total. */
export const MAX_HOME_SUPPLIERS = 3;

/**
 * The supplier lines on the admin home: one per supplier ("You owe Prism ₹X"), or, with more than
 * MAX_HOME_SUPPLIERS, one total line ("You owe suppliers ₹X") and the page lists each one.
 */
export function supplierHomeLines(
  rows: readonly { name: string; balancePaise: number }[],
): { text: string; amountPaise: number }[] {
  if (rows.length <= MAX_HOME_SUPPLIERS) return rows.map((r) => supplierBalanceLabel(r.name, r.balancePaise));
  const total = rows.reduce((n, r) => n + r.balancePaise, 0);
  if (total > 0) return [{ text: "You owe suppliers", amountPaise: total }];
  if (total < 0) return [{ text: "Suppliers owe you", amountPaise: -total }];
  return [{ text: "All settled", amountPaise: 0 }];
}

export type SupplierRow = { id: string; name: string; active: boolean; balancePaise: number; entries: number };

/**
 * The suppliers list: every switched-on brand, plus a switched-off brand that still has entries
 * (its balance must stay visible). By name.
 */
/**
 * The supplier a statement opens on: the one picked before if it is still listed, else the first
 * with entries (Prism today), else the first. An empty brand's account is never the default.
 */
export function startSupplier(suppliers: readonly { id: string; entries: number }[], picked?: string | null): string {
  if (suppliers.some((s) => s.id === picked)) return picked as string;
  return (suppliers.find((s) => s.entries > 0) ?? suppliers[0])?.id ?? "";
}

export function suppliersToShow(
  brands: readonly { id: string; name: string; active: boolean }[],
  totals: readonly { brandId: string; balancePaise: number; entries: number }[],
): SupplierRow[] {
  const byBrand = new Map(totals.map((t) => [t.brandId, t]));
  return brands
    .map((b) => ({
      id: b.id,
      name: b.name,
      active: b.active,
      balancePaise: byBrand.get(b.id)?.balancePaise ?? 0,
      entries: byBrand.get(b.id)?.entries ?? 0,
    }))
    .filter((b) => b.active || b.entries > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** A brand id: any non-empty text (the action checks the brand exists). */
function checkBrandId(brandId: unknown): { ok: true; brandId: string } | { ok: false; error: string } {
  return typeof brandId === "string" && brandId.trim() ? { ok: true, brandId } : { ok: false, error: "Pick a brand." };
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
  return Number.isSafeInteger(total) && total <= MAX_SUPPLIER_PAISE ? total : null;
}

/** A positive amount in paise, within the limit. */
function checkAmount(amountPaise: unknown): { ok: true; paise: number } | { ok: false; error: string } {
  if (typeof amountPaise !== "number" || !Number.isSafeInteger(amountPaise) || amountPaise === 0) {
    return { ok: false, error: "Enter the amount." };
  }
  if (Math.abs(amountPaise) > MAX_SUPPLIER_PAISE) return { ok: false, error: "That amount is too large." };
  return { ok: true, paise: amountPaise };
}

function cleanText(text: unknown, max: number): string {
  return typeof text === "string" ? text.trim().slice(0, max) : "";
}

/**
 * Opening balance, once per brand. `amountPaise` is signed: + we owe the supplier, - the supplier owes us.
 * `existing` are the entries already saved (any brand; only this brand's count).
 */
export function openingEntry(
  existing: readonly { brandId: string; kind: string }[],
  brandId: unknown,
  amountPaise: unknown,
  entryDate: string,
): SupplierResult {
  const b = checkBrandId(brandId);
  if (!b.ok) return b;
  const a = checkAmount(amountPaise);
  if (!a.ok) return a;
  if (existing.some((e) => e.kind === "opening" && e.brandId === b.brandId)) {
    return { ok: false, error: "Opening balance is already set." };
  }
  return {
    ok: true,
    entry: { brandId: b.brandId, kind: "opening", amountPaise: a.paise, entryDate, mode: null, reference: "", note: "Opening balance" },
  };
}

/**
 * A purchase: + bags x cost per bag, owed to the supplier of the purchased product's brand.
 * `description` is shown as the note, e.g. "100 bags Prism Trade OPC 43".
 */
export function purchaseEntry(
  product: { brandId: string },
  bags: number,
  costPerBagPaise: unknown,
  entryDate: string,
  extra: { reference?: unknown; description?: string } = {},
): SupplierResult {
  const b = checkBrandId(product?.brandId);
  if (!b.ok) return b;
  const cost = checkCostPerBag(costPerBagPaise);
  if (!cost.ok) return cost;
  const amount = purchaseAmountPaise(bags, cost.costPaise);
  if (amount === null) return { ok: false, error: "That purchase is too large." };
  const note = extra.description ?? `${bags} bags`;
  return {
    ok: true,
    entry: {
      brandId: b.brandId,
      kind: "purchase",
      amountPaise: amount,
      entryDate,
      mode: null,
      reference: cleanText(extra.reference, MAX_SUPPLIER_REFERENCE),
      note: note.slice(0, MAX_SUPPLIER_NOTE),
    },
  };
}

/** Payment to the supplier: - the amount. `amountPaise` is typed as a positive amount. */
export function paymentEntry(
  brandId: unknown,
  amountPaise: unknown,
  mode: unknown,
  reference: unknown,
  entryDate: string,
): SupplierResult {
  const b = checkBrandId(brandId);
  if (!b.ok) return b;
  const a = checkAmount(amountPaise);
  if (!a.ok) return a;
  if (a.paise < 0) return { ok: false, error: "Enter the amount." };
  if (typeof mode !== "string" || !(SUPPLIER_PAYMENT_MODES as readonly string[]).includes(mode)) {
    return { ok: false, error: "Pick bank, cash or other." };
  }
  const ref = cleanText(reference, MAX_SUPPLIER_REFERENCE + 1);
  if (ref.length > MAX_SUPPLIER_REFERENCE) return { ok: false, error: "That reference is too long." };
  if (mode === "bank" && !ref) return { ok: false, error: "Enter the bank reference (UTR)." };
  return {
    ok: true,
    entry: {
      brandId: b.brandId,
      kind: "payment",
      amountPaise: -a.paise,
      entryDate,
      mode: mode as SupplierPaymentMode,
      reference: ref,
      note: "",
    },
  };
}

/** Scheme / discount credit from the supplier: - the amount, reason required. */
export function creditEntry(brandId: unknown, amountPaise: unknown, reason: unknown, entryDate: string): SupplierResult {
  const b = checkBrandId(brandId);
  if (!b.ok) return b;
  const a = checkAmount(amountPaise);
  if (!a.ok) return a;
  if (a.paise < 0) return { ok: false, error: "Enter the amount." };
  const r = checkReason(reason);
  if (!r.ok) return r;
  return {
    ok: true,
    entry: { brandId: b.brandId, kind: "credit", amountPaise: -a.paise, entryDate, mode: null, reference: "", note: r.reason },
  };
}

/** Admin's fix: signed (+ we owe more, - we owe less), reason required. */
export function adjustmentEntry(brandId: unknown, amountPaise: unknown, reason: unknown, entryDate: string): SupplierResult {
  const b = checkBrandId(brandId);
  if (!b.ok) return b;
  const a = checkAmount(amountPaise);
  if (!a.ok) return a;
  const r = checkReason(reason);
  if (!r.ok) return r;
  return {
    ok: true,
    entry: { brandId: b.brandId, kind: "adjustment", amountPaise: a.paise, entryDate, mode: null, reference: "", note: r.reason },
  };
}
