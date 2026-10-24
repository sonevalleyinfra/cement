/**
 * Reason codes: the "why" picked from a short list (plus an optional note) when an order is rejected
 * or cancelled, a rate is changed, an approval goes over the credit limit, a payment is rejected or
 * reversed, stock is corrected, a shop that still owes is turned off, or an admin records a payment received more than 2 days ago. Plain functions (no database) so they are easy to test.
 * Source: cement v2 plan A4 and design spec section 6 (ReasonPicker).
 *
 * - Each list is ordered by how common the reason is; "other" is always last. Labels are 3 words at most.
 * - The note is trimmed, inner spaces collapsed, at most 200 characters, and required only for "other".
 * - A shop may read some labels in its order history (isShopVisibleReason); every other code,
 *   and every note that talks about money, is for staff only (see order-access historyForViewer).
 */

export type ReasonOption<C extends string> = { code: C; label: string };

function list<const T extends readonly ReasonOption<string>[]>(options: T): T {
  return options;
}

export const REJECT_REASONS = list([
  { code: "rate_dispute", label: "Rate dispute" },
  { code: "no_stock", label: "Out of stock" },
  { code: "duplicate", label: "Duplicate" },
  { code: "over_credit", label: "Over limit" },
  { code: "shop_asked", label: "Shop asked" },
  { code: "other", label: "Other" },
]);

export const CANCEL_REASONS = list([
  { code: "shop_asked", label: "Shop asked" },
  { code: "no_stock", label: "Out of stock" },
  { code: "entry_mistake", label: "Wrong entry" },
  { code: "duplicate", label: "Duplicate" },
  { code: "truck_issue", label: "Truck issue" },
  { code: "other", label: "Other" },
]);

export const RATE_CHANGE_REASONS = list([
  { code: "rate_dispute", label: "Rate dispute" },
  { code: "entry_mistake", label: "Wrong entry" },
  { code: "price_revision", label: "Market change" },
  { code: "owner_said", label: "Owner said" },
  { code: "other", label: "Other" },
]);

/** Approving over the credit limit. Codes only for now: the screen comes with the credit check (B1). */
export const OVERRIDE_REASONS = list([
  { code: "payment_promised", label: "Payment promised" },
  { code: "old_customer", label: "Old customer" },
  { code: "owner_said", label: "Owner said yes" },
  { code: "cash_on_delivery", label: "Cash on delivery" },
  { code: "other", label: "Other" },
]);

/** Rejecting an online payment and reversing a payment share this list. */
export const PAYMENT_REASONS = list([
  { code: "wrong_shop", label: "Wrong shop" },
  { code: "wrong_amount", label: "Wrong amount" },
  { code: "duplicate", label: "Duplicate" },
  { code: "not_in_bank", label: "Not received" },
  { code: "bounced", label: "Bounced" },
  { code: "other", label: "Other" },
]);

export const STOCK_REASONS = list([
  { code: "transit_short", label: "Transit short" },
  { code: "transit_burst", label: "Transit burst" },
  { code: "damage", label: "Damaged" },
  { code: "entry_mistake", label: "Wrong entry" },
  { code: "expired", label: "Expired" },
  { code: "other", label: "Other" },
]);

/** An admin recording a payment received more than 2 days ago (receipt-rules checkReceivedOn). Staff only. */
export const BACKDATE_REASONS = list([
  { code: "late_entry", label: "Late entry" },
  { code: "bank_delay", label: "Bank delay" },
  { code: "entry_mistake", label: "Wrong entry" },
  { code: "owner_said", label: "Owner said" },
  { code: "other", label: "Other" },
]);

/** Turning off a shop that still owes (design spec section 1). */
export const SHOP_OFF_REASONS = list([
  { code: "closed_down", label: "Closed down" },
  { code: "moved", label: "Moved" },
  { code: "bad_debt", label: "Bad debt" },
  { code: "duplicate", label: "Duplicate" },
  { code: "other", label: "Other" },
]);

export const REASON_LISTS = {
  reject: REJECT_REASONS,
  cancel: CANCEL_REASONS,
  rate_change: RATE_CHANGE_REASONS,
  override: OVERRIDE_REASONS,
  payment: PAYMENT_REASONS,
  stock: STOCK_REASONS,
  backdate: BACKDATE_REASONS,
  shop_off: SHOP_OFF_REASONS,
} as const;

export type ReasonAction = keyof typeof REASON_LISTS;
export type ReasonCode<A extends ReasonAction> = (typeof REASON_LISTS)[A][number]["code"];

function codes<A extends ReasonAction>(action: A): ReasonCode<A>[] {
  return REASON_LISTS[action].map((o) => o.code) as ReasonCode<A>[];
}

/** Every code an order history row may carry (reject, cancel, rate change, override), once each. */
export const ORDER_EVENT_REASON_CODES = [
  ...new Set([...codes("reject"), ...codes("cancel"), ...codes("rate_change"), ...codes("override")]),
] as const;
export type OrderEventReasonCode = (typeof ORDER_EVENT_REASON_CODES)[number];

export const PAYMENT_REASON_CODES = codes("payment");
export type PaymentReasonCode = ReasonCode<"payment">;

export const STOCK_REASON_CODES = codes("stock");
export type StockReasonCode = ReasonCode<"stock">;

export const BACKDATE_REASON_CODES = codes("backdate");
export type BackdateReasonCode = ReasonCode<"backdate">;

/** True when `code` is in that action's list. */
export function isReasonCode<A extends ReasonAction>(action: A, code: unknown): code is ReasonCode<A> {
  return typeof code === "string" && (codes(action) as string[]).includes(code);
}

export function isOrderEventReasonCode(code: unknown): code is OrderEventReasonCode {
  return typeof code === "string" && (ORDER_EVENT_REASON_CODES as readonly string[]).includes(code);
}

export function isPaymentReasonCode(code: unknown): code is PaymentReasonCode {
  return isReasonCode("payment", code);
}

export function isStockReasonCode(code: unknown): code is StockReasonCode {
  return isReasonCode("stock", code);
}

const LABELS = new Map<string, string>();
for (const options of Object.values(REASON_LISTS)) {
  // The first label wins when a code is in several lists ("owner_said" reads "Owner said").
  for (const o of options) if (!LABELS.has(o.code)) LABELS.set(o.code, o.label);
}

/** The short label of a code ("no_stock" → "Out of stock"); "" for null or an unknown code. */
export function reasonLabel(code: string | null | undefined, action?: ReasonAction): string {
  if (!code) return "";
  if (action) {
    const own = REASON_LISTS[action].find((o) => o.code === code);
    if (own) return own.label;
  }
  return LABELS.get(code) ?? "";
}

/** The label, then " · note" when there is one ("Out of stock · back on Monday"). */
export function reasonText(code: string | null | undefined, note: string | null | undefined, action?: ReasonAction): string {
  const label = reasonLabel(code, action);
  const clean = String(note ?? "").trim();
  return [label, clean].filter(Boolean).join(" · ");
}

/** Codes a shop may read in its own order history. Everything else is for staff only. */
const SHOP_VISIBLE = new Set<string>(["no_stock", "duplicate", "shop_asked", "truck_issue", "entry_mistake"]);

export function isShopVisibleReason(code: string | null | undefined): boolean {
  return !!code && SHOP_VISIBLE.has(code);
}

export const MAX_REASON_NOTE = 200;

/** A typed note: trimmed, inner spaces collapsed. */
export function cleanReasonNote(note: unknown): string {
  return typeof note === "string" ? note.trim().replace(/\s+/g, " ") : "";
}

export type ReasonCheck<A extends ReasonAction> =
  | { ok: true; code: ReasonCode<A>; note: string }
  | { ok: false; error: string };

/** The one check for every "why": a code from that action's list, a short note, a note for "other". */
export function checkReason<A extends ReasonAction>(action: A, code: unknown, note: unknown): ReasonCheck<A> {
  if (!isReasonCode(action, code)) return { ok: false, error: "Pick a reason" };
  const clean = cleanReasonNote(note);
  if (clean.length > MAX_REASON_NOTE) return { ok: false, error: "Keep the note under 200 characters" };
  if (code === "other" && !clean) return { ok: false, error: "Add a note" };
  return { ok: true, code, note: clean };
}

/** What is still missing in a reason picker (the FormHint above the button), or null when it is ready. */
export function reasonHint(action: ReasonAction, code: unknown, note: unknown): string | null {
  const check = checkReason(action, code, note);
  return check.ok ? null : check.error;
}
