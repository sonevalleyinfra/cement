/**
 * Rules for filling the rate, approving/rejecting, and linking a retailer login.
 * Plain functions (no database, no request) so they are easy to test.
 * Status moves and role checks come from order-rules.ts; nothing is repeated here.
 *
 * Choices where the spec is silent:
 * - A rate above MAX_RATE_RUPEES_PER_BAG is refused as a typo (a sanity cap, not a price rule).
 *   The same cap applies when filling the rate and when logistics edits it at dispatch.
 */
import { formatINR } from "./money";
import { canUserTransition, isOrderStatus, isValidReason, isValidRatePaise } from "./order-rules";
import { hasRole, isAdmin } from "./roles";

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

/** Same as checkRateDigits, but just the paise (or null when the rate is not valid). */
export function ratePaiseFromRupeeDigits(digits: string): number | null {
  const check = checkRateDigits(digits);
  return check.ok ? check.paise : null;
}

/** Sales can fill the rate on a "placed" order if they are the assigned rep. Admin can always. */
export function canFillRate(
  role: string | null | undefined,
  userId: string,
  salesRepId: string | null,
  status: string,
): boolean {
  if (!isOrderStatus(status) || !canUserTransition(role, status, "rate_filled")) return false;
  return isAdmin(role) || (hasRole(role, "sales") && salesRepId === userId);
}

/** Accounts (or admin) decide on orders that have a rate and wait for approval. */
export function canDecide(
  role: string | null | undefined,
  status: string,
  decision: "approved" | "rejected",
): boolean {
  return isOrderStatus(status) && canUserTransition(role, status, decision);
}

export type RejectCheck = { ok: true; reason: string } | { ok: false; error: string };

export function checkRejectReason(reason: string | null | undefined): RejectCheck {
  if (!isValidReason(reason)) return { ok: false, error: "Enter a reason for rejecting." };
  return { ok: true, reason: (reason as string).trim().slice(0, 300) };
}

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
