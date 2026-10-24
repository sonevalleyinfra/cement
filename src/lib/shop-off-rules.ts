/**
 * Turning a shop off or on, and which shops the payment form lists. Plain functions: no database.
 * Source: design spec section 1 ("Turn off with dues > 0: ConfirmStep + '₹X due' + ReasonPicker").
 *
 * - A switched-off shop keeps its dues: it stays in the overdue list, the ledger and the payment
 *   picker until it owes nothing, so the money can still be collected.
 * - Turning off a shop that owes needs a reason (shop_off list in reason-codes.ts). With no dues a
 *   reason is optional, but checked when one is given.
 */
import { checkReason, type ReasonCode } from "./reason-codes";

export type ShopOffReason = { code: ReasonCode<"shop_off">; note: string };

export type ShopSwitchPlan = { ok: true; reason: ShopOffReason | null } | { ok: false; error: string };

/** `duesPaise` = what the shop owes now (the ledger balance; an advance is ≤ 0). Inputs are untrusted. */
export function planShopSwitch(input: {
  makeActive: boolean;
  duesPaise: number;
  code?: unknown;
  note?: unknown;
}): ShopSwitchPlan {
  if (input.makeActive) return { ok: true, reason: null };
  const given = input.code !== undefined && input.code !== null && input.code !== "";
  if (input.duesPaise <= 0 && !given) return { ok: true, reason: null };
  const check = checkReason("shop_off", input.code, input.note);
  if (!check.ok) return check;
  return { ok: true, reason: { code: check.code, note: check.note } };
}

/**
 * The shops the payment form offers: switched-on shops, plus switched-off shops that still owe
 * (`balances`: retailer id → ledger balance in paise; > 0 = owes). Order is kept.
 */
export function payableShops<T extends { id: string; active: boolean }>(
  shops: readonly T[],
  balances: ReadonlyMap<string, number>,
): T[] {
  return shops.filter((s) => s.active || (balances.get(s.id) ?? 0) > 0);
}
