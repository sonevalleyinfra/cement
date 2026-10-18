/**
 * Rules for the rate per bag (typed in rupees and paise per bag, kept as integer paise),
 * approving / rejecting, and linking a retailer login.
 * Plain functions (no database, no request) so they are easy to test.
 * Source: docs/idea.md section 3 (Order flow).
 *
 * Owner's rule: "sales put the rate, logistics and admin can alter it".
 * - Staff placing an order type the rate. A retailer never sees or sends one: the order waits
 *   for the shop's sales person to fill it.
 * - Sales only fill a rate that is empty: on the order they place, or on a retailer's order for
 *   their own shop (admin may fill an empty rate too). No reason needed.
 * - Once a rate is set, only logistics or admin change it, at any step before the order is fully
 *   dispatched (placed, approved, partly dispatched), always with a reason. It is logged as a rate
 *   change (old → new) and accounts, the shop's sales person and admin are told. The new rate is
 *   billed on the bags dispatched from then on.
 * - Accounts approve only once the rate is filled. Rejecting needs a reason.
 * - History rows about the rate never contain the price (retailers read the history).
 *
 * Choices where the spec is silent:
 * - A rate above MAX_RATE_RUPEES_PER_BAG is refused as a typo (a sanity cap, not a price rule).
 * - Rejecting also waits for the rate (the spec says approve / reject "only when the rate is filled").
 */
import { formatINR } from "./money";
import {
  canUserTransition,
  cleanReason,
  isOrderStatus,
  isValidRatePaise,
  isValidReason,
  orderTotalPaise,
} from "./order-rules";
import { isStaff } from "./permissions";
import { hasAnyRole, hasRole, isAdmin } from "./roles";

/** Highest rate per bag we accept, in whole rupees. Change here if prices rise. */
export const MAX_RATE_RUPEES_PER_BAG = 2000;

export type RateInputCheck = { ok: true; paise: number } | { ok: false; error: string };

/** Rupees, an optional dot, then paise digits ("335", "335.50", "335.", ".5"). Linear: no nested repeats. */
const RATE_TEXT = /^(\d*)(?:\.(\d*))?$/;

function rateTooHigh(): RateInputCheck {
  const max = formatINR(MAX_RATE_RUPEES_PER_BAG * 100, { hidePaise: true });
  return { ok: false, error: `Rate looks too high (max ${max} per bag).` };
}

/**
 * A typed rate per bag in rupees and paise. Returns paise, or the reason it is not a valid rate.
 * Strict: more than 2 digits after the dot is refused (never rounded). String and integer maths only.
 */
export function checkRateInput(text: string): RateInputCheck {
  const ask: RateInputCheck = { ok: false, error: "Enter a rate per bag." };
  const clean = String(text ?? "").trim();
  if (clean.includes(",")) return { ok: false, error: "Use a dot for paise, like 335.50." };
  const m = RATE_TEXT.exec(clean);
  if (!m) return ask;
  const whole = m[1].replace(/^0+(?=\d)/, "");
  const fraction = m[2] ?? "";
  if (whole === "" && fraction === "") return ask;
  if (fraction.length > 2) return { ok: false, error: "Use at most 2 digits after the dot." };
  if (whole.length > 4) return rateTooHigh();
  const paise = Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0"));
  if (paise > MAX_RATE_RUPEES_PER_BAG * 100) return rateTooHigh();
  return isValidRatePaise(paise) ? { ok: true, paise } : ask;
}

/**
 * Tidies what is typed or pasted into the rate box: drops ₹, spaces, a leading "Rs" / "Rs." / "INR"
 * and thousands commas, then anything that is not a digit, dot or comma. Keeps every digit and dot
 * (checkRateInput refuses what is wrong) and never cuts the length. The server never calls this.
 */
export function cleanRateInput(raw: string): string {
  const text = String(raw ?? "")
    .replace(/[₹\s]/g, "")
    .replace(/^(?:rs\.?|inr)/i, "");
  // Commas go only when they group thousands ("1,234.50", "1,23,456"). Any other comma ("3,50")
  // stays, so checkRateInput refuses it instead of reading it as ₹350.
  const grouped = THOUSANDS.test(text) || LAKHS.test(text);
  return (grouped ? text.replace(/,/g, "") : text).replace(/[^\d.,]/g, "");
}

const THOUSANDS = /^\d{1,3}(?:,\d{3})+(?:\.\d*)?$/;
const LAKHS = /^\d{1,2}(?:,\d{2})*,\d{3}(?:\.\d*)?$/;

/** A rate change on a partly sent order: the bags not sent at the new rate, and the whole order total. */
export function rateChangePreview(input: { unsentBags: number; billedPaise: number; newRatePaise: number }): {
  unsentPaise: number;
  orderTotalPaise: number;
} {
  const unsentPaise = orderTotalPaise(input.unsentBags, input.newRatePaise);
  return { unsentPaise, orderTotalPaise: input.billedPaise + unsentPaise };
}

/**
 * The rate saved on a new order. Staff (sales, admin) must type it. Anyone else (a retailer)
 * never sends one: anything sent is ignored (null).
 */
export function rateOnPlace(
  role: string | null | undefined,
  rateText: string | null | undefined,
): { ok: true; ratePaise: number | null } | { ok: false; error: string } {
  if (!isStaff(role)) return { ok: true, ratePaise: null };
  const rate = checkRateInput(String(rateText ?? ""));
  return rate.ok ? { ok: true, ratePaise: rate.paise } : rate;
}

/** A placed order with no rate yet: its sales person (or admin) may fill it. A rate that is set is never "filled" again. */
export function canFillRate(
  role: string | null | undefined,
  userId: string,
  order: { status: string; salesRepId: string | null; ratePaise: number | null },
): boolean {
  if (order.status !== "placed" || order.ratePaise !== null) return false;
  return isAdmin(role) || (hasRole(role, "sales") && order.salesRepId === userId);
}

/** Steps at which a set rate may still change: anything before fully dispatched (and not rejected or cancelled). */
const RATE_CHANGE_STATUSES: readonly string[] = ["placed", "approved", "partly_dispatched"];

/** A rate that is set: logistics or admin may change it (with a reason) until the order is fully dispatched. */
export function canChangeRate(
  role: string | null | undefined,
  order: { status: string; ratePaise: number | null },
): boolean {
  if (order.ratePaise === null || !RATE_CHANGE_STATUSES.includes(order.status)) return false;
  return hasAnyRole(role, ["logistics"]);
}

export type RateChangeCheck = { ok: true; ratePaise: number; reason: string } | { ok: false; error: string };

/** A rate change: a valid, different rate and a reason. */
export function checkRateChange(
  currentRatePaise: number | null,
  rateText: string | null | undefined,
  reason: string | null | undefined,
): RateChangeCheck {
  const rate = checkRateInput(String(rateText ?? ""));
  if (!rate.ok) return rate;
  if (rate.paise === currentRatePaise) return { ok: false, error: "That is the rate already." };
  if (!isValidReason(reason)) return { ok: false, error: "Enter a reason for changing the rate." };
  return { ok: true, ratePaise: rate.paise, reason: cleanReason(reason) };
}

export type DecideCheck = { ok: true } | { ok: false; error: string };

/**
 * Accounts (or admin) decide on a placed order, and only once its rate is filled.
 * `seenRatePaise` is the rate shown on their screen: if the sales person changed it meanwhile,
 * the decision is refused so they look again at the new rate.
 */
export function canDecide(
  role: string | null | undefined,
  order: { status: string; ratePaise: number | null },
  decision: "approved" | "rejected",
  seenRatePaise: unknown,
): DecideCheck {
  if (!isOrderStatus(order.status) || !canUserTransition(role, order.status, decision)) {
    return { ok: false, error: "This order is not waiting for approval." };
  }
  if (order.ratePaise === null) return { ok: false, error: "The rate is not filled yet." };
  if (typeof seenRatePaise !== "number" || !Number.isSafeInteger(seenRatePaise)) {
    return { ok: false, error: "Refresh the page and try again." };
  }
  if (seenRatePaise !== order.ratePaise) {
    return { ok: false, error: `Rate changed to ${formatINR(order.ratePaise)}, check again.` };
  }
  return { ok: true };
}

/** True when the order waits for accounts: placed with a rate. */
export function isWaitingApproval(order: { status: string; ratePaise: number | null }): boolean {
  return order.status === "placed" && order.ratePaise !== null;
}

export type RejectCheck = { ok: true; reason: string } | { ok: false; error: string };

export function checkRejectReason(reason: string | null | undefined): RejectCheck {
  if (!isValidReason(reason)) return { ok: false, error: "Enter a reason for rejecting." };
  return { ok: true, reason: cleanReason(reason) };
}

/* ---------- History rows about the rate (never the price itself) ---------- */

export const RATE_FILLED = "Rate filled";
const RATE_EDIT_PREFIX = "Rate edited:";

/** History reason for a rate change (a rate that was already set). */
export function rateEditReason(reason: string): string {
  return `${RATE_EDIT_PREFIX} ${reason}`;
}

/** "₹350 → ₹360" (just "₹350" when there was no rate before). Staff only: retailers never see rates. */
export function rateMoveText(fromPaise: number | null, toPaise: number): string {
  const to = formatINR(toPaise, { hidePaise: true });
  return fromPaise === null || fromPaise === toPaise ? to : `${formatINR(fromPaise, { hidePaise: true })} → ${to}`;
}

/** Rows that are about the rate (a fill or a change): staff only. */
export function isRateEvent(reason: string | null | undefined): boolean {
  const r = reason ?? "";
  return r === RATE_FILLED || r.startsWith(RATE_EDIT_PREFIX);
}

/** The step name for a rate row, or null when the row is not about the rate. */
export function rateEventLabel(reason: string | null | undefined): string | null {
  const r = reason ?? "";
  if (r === RATE_FILLED) return "Rate filled";
  if (r.startsWith(RATE_EDIT_PREFIX)) return "Rate edited";
  return null;
}

/* ---------- Retailer logins ---------- */

/** One login links to one retailer: refuse if another retailer already uses this user. */
export function canLinkRetailerUser(
  userId: string,
  retailerId: string,
  links: readonly { retailerId: string; userId: string | null }[],
): { ok: true } | { ok: false; error: string } {
  const taken = links.find((l) => l.userId === userId && l.retailerId !== retailerId);
  if (taken) return { ok: false, error: "That login is already linked to another retailer." };
  return { ok: true };
}
