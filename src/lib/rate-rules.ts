/**
 * Rules for the rate per bag, approving / rejecting, and linking a retailer login.
 * Plain functions (no database, no request) so they are easy to test.
 * Source: docs/idea.md section 3 (Order flow).
 *
 * - Staff placing an order type the rate. A retailer never sees or sends one: the order waits
 *   for the shop's sales person to fill it.
 * - While "placed": the order's sales person (or admin) fills or changes the rate. No reason needed.
 * - Accounts approve only once the rate is filled. Rejecting needs a reason.
 * - After approval (approved / partly dispatched): logistics or admin change the rate, with a
 *   reason. The new rate is billed on the bags dispatched from then on.
 * - History rows about the rate never contain the price (retailers read the history).
 *
 * Choices where the spec is silent:
 * - A rate above MAX_RATE_RUPEES_PER_BAG is refused as a typo (a sanity cap, not a price rule).
 * - Rejecting also waits for the rate (the spec says approve / reject "only when the rate is filled").
 */
import { formatINR } from "./money";
import { canUserTransition, cleanReason, isOrderStatus, isValidRatePaise, isValidReason } from "./order-rules";
import { hasAnyRole, hasRole, isAdmin, isRetailerOnly } from "./roles";

/** Highest rate per bag we accept, in whole rupees. Change here if prices rise. */
export const MAX_RATE_RUPEES_PER_BAG = 2000;

export type RateDigitsCheck = { ok: true; paise: number } | { ok: false; error: string };

/** Keypad gives whole rupees per bag as digits. Returns paise, or the reason it is not a valid rate. */
export function checkRateDigits(digits: string): RateDigitsCheck {
  const clean = String(digits ?? "").trim();
  if (!/^\d{1,7}$/.test(clean)) return { ok: false, error: "Enter a rate per bag." };
  const rupees = Number(clean);
  if (rupees > MAX_RATE_RUPEES_PER_BAG) {
    const max = formatINR(MAX_RATE_RUPEES_PER_BAG * 100, { hidePaise: true });
    return { ok: false, error: `Rate looks too high (max ${max} per bag).` };
  }
  const paise = rupees * 100;
  return isValidRatePaise(paise) ? { ok: true, paise } : { ok: false, error: "Enter a rate per bag." };
}

/**
 * The rate saved on a new order. A retailer never sends one (anything sent is ignored, null).
 * Staff (sales, admin) must type it.
 */
export function rateOnPlace(
  role: string | null | undefined,
  rupeeDigits: string | null | undefined,
): { ok: true; ratePaise: number | null } | { ok: false; error: string } {
  if (isRetailerOnly(role)) return { ok: true, ratePaise: null };
  const rate = checkRateDigits(String(rupeeDigits ?? ""));
  return rate.ok ? { ok: true, ratePaise: rate.paise } : rate;
}

/** While "placed": the order's sales person or admin may fill or change the rate. */
export function canFillRate(
  role: string | null | undefined,
  userId: string,
  order: { status: string; salesRepId: string | null },
): boolean {
  if (order.status !== "placed") return false;
  return isAdmin(role) || (hasRole(role, "sales") && order.salesRepId === userId);
}

/** After approval (approved / partly dispatched): logistics or admin may change the rate. */
export function canChangeRate(role: string | null | undefined, status: string): boolean {
  return (status === "approved" || status === "partly_dispatched") && hasAnyRole(role, ["logistics"]);
}

export type RateChangeCheck = { ok: true; ratePaise: number; reason: string } | { ok: false; error: string };

/** A rate change after approval: a valid, different rate and a reason. */
export function checkRateChange(
  currentRatePaise: number | null,
  rupeeDigits: string | null | undefined,
  reason: string | null | undefined,
): RateChangeCheck {
  const rate = checkRateDigits(String(rupeeDigits ?? ""));
  if (!rate.ok) return rate;
  if (rate.paise === currentRatePaise) return { ok: false, error: "That is the rate already." };
  if (!isValidReason(reason)) return { ok: false, error: "Enter a reason for changing the rate." };
  return { ok: true, ratePaise: rate.paise, reason: cleanReason(reason) };
}

export type DecideCheck = { ok: true } | { ok: false; error: string };

/** Accounts (or admin) decide on a placed order, and only once its rate is filled. */
export function canDecide(
  role: string | null | undefined,
  order: { status: string; ratePaise: number | null },
  decision: "approved" | "rejected",
): DecideCheck {
  if (!isOrderStatus(order.status) || !canUserTransition(role, order.status, decision)) {
    return { ok: false, error: "This order is not waiting for approval." };
  }
  if (order.ratePaise === null) return { ok: false, error: "The rate is not filled yet." };
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

/** History reason for a rate change after approval. */
export function rateEditReason(reason: string): string {
  return `${RATE_EDIT_PREFIX} ${reason}`;
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
