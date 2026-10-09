/**
 * Who may place orders, who sees prices, and which orders a person sees.
 * Plain functions (no database) so they are easy to test.
 *
 * Choices where the spec is silent:
 * - A person with the retailer role AND any staff role counts as staff.
 * - Only a pure retailer is price-blind and limited to their own shop's orders.
 * - A pure retailer sees the order history without rate-edit rows, and a staff reason that
 *   talks about money (rate, price, ₹, rs, discount...) is hidden. A "Closed short" row keeps
 *   its first sentence (how many bags were not sent) and drops the staff part.
 * - Dispatch loads (bags, vehicle, driver, phone, date) are shown to everyone who may see the
 *   order (spec 4.6: "Visible to retailer and sales rep"); the load's rate only to staff.
 */
import { isRateEditReason } from "./dispatch-rules";
import { hasAnyRole, isAdmin, parseRoles } from "./roles";
import { canUserTransition, isOrderStatus, isValidBags, rolesForTransition, type OrderStatus } from "./order-rules";

/** Pure retailer = has the retailer role and no staff role (and is not admin). */
export function isRetailerOnly(role: string | null | undefined): boolean {
  if (isAdmin(role)) return false;
  const roles = parseRoles(role);
  return roles.includes("retailer") && roles.every((r) => r === "retailer");
}

/** Retailers never see prices or amounts. Everyone else does. */
export function canSeePrice(role: string | null | undefined): boolean {
  return !isRetailerOnly(role);
}

/** Sales, retailers and admin may place orders. */
export function canPlaceOrder(role: string | null | undefined): boolean {
  return hasAnyRole(role, ["sales", "retailer"]);
}

export type PlaceOrderInput = {
  readOnlyMode: boolean;
  bags: number;
  retailerId: string | null;
  productId: string | null;
};

/** Checks a new order before saving. Returns the first problem found. */
export function validatePlaceOrder(
  input: PlaceOrderInput,
): { ok: true } | { ok: false; error: string } {
  if (input.readOnlyMode) return { ok: false, error: "Pick one firm to place an order." };
  if (!input.retailerId) return { ok: false, error: "Pick a retailer." };
  if (!input.productId) return { ok: false, error: "Pick a product." };
  if (!isValidBags(input.bags)) return { ok: false, error: "Enter the number of bags." };
  return { ok: true };
}

/** Largest bags value accepted for one order (guards typos like 9999999). */
export const MAX_ORDER_BAGS = 100000;

export function isBagsInRange(bags: number): boolean {
  return isValidBags(bags) && bags <= MAX_ORDER_BAGS;
}

/** The retailer an order is placed for: a retailer user is fixed to their own shop. */
export function resolveOrderRetailer(
  role: string | null | undefined,
  ownRetailerId: string | null,
  chosenRetailerId: string | null,
): string | null {
  return isRetailerOnly(role) ? ownRetailerId : chosenRetailerId;
}

/** Which order filter applies: a pure retailer sees only their shop, others see the firm. */
export function orderListScope(
  role: string | null | undefined,
  ownRetailerId: string | null,
): { kind: "all" } | { kind: "retailer"; retailerId: string } | { kind: "none" } {
  if (!isRetailerOnly(role)) return { kind: "all" };
  return ownRetailerId ? { kind: "retailer", retailerId: ownRetailerId } : { kind: "none" };
}

/** Words for the chip when the colour group would be misleading (a cancelled order is not "Rejected"). */
export function chipLabel(status: OrderStatus): string | undefined {
  if (status === "cancelled") return "Cancelled";
  if (status === "partly_dispatched") return "Partly dispatched";
  return undefined;
}

/** Maps the detailed order status to the five colours the status chip knows. */
export function chipStatus(
  status: OrderStatus,
): "pending" | "approved" | "rejected" | "dispatched" | "delivered" {
  switch (status) {
    case "placed":
    case "rate_filled":
      return "pending";
    case "approved":
    case "assigned":
      return "approved";
    case "rejected":
    case "cancelled":
      return "rejected";
    case "partly_dispatched":
    case "dispatched":
      return "dispatched";
    case "delivered":
      return "delivered";
  }
}

/**
 * May this person cancel this order now? The status step must allow their role
 * (order-rules). Before approval only sales may cancel, and only an order they
 * placed or are the assigned rep for. After approval it is accounts' call. Admin always.
 */
export function canCancelOrder(
  role: string | null | undefined,
  userId: string,
  order: { status: string; placedBy: string | null; salesRepId: string | null },
): boolean {
  if (!isOrderStatus(order.status) || !canUserTransition(role, order.status, "cancelled")) return false;
  if (isAdmin(role) || !rolesForTransition(order.status, "cancelled").includes("sales")) return true;
  return order.placedBy === userId || order.salesRepId === userId;
}

/** Words that give a price away in a free-text staff reason. */
const MONEY_WORDS = /(\brate|\bpric|₹|\brs\b|\brs\.|rupee|paise|discount|\bcost|\bamount|\/-)/i;
const CLOSED_SHORT = /^Closed short: \d+ bags? not sent\./;

export function mentionsMoney(text: string | null | undefined): boolean {
  return MONEY_WORDS.test(text ?? "");
}

/**
 * The order history this person may read. Staff see everything. A pure retailer does not
 * see rate edits, nor staff reasons that mention money.
 */
export function historyForViewer<T extends { reason: string }>(
  role: string | null | undefined,
  events: readonly T[],
): T[] {
  if (!isRetailerOnly(role)) return [...events];
  return events
    .filter((e) => !isRateEditReason(e.reason))
    .map((e) => {
      if (!mentionsMoney(e.reason)) return e;
      const closedShort = CLOSED_SHORT.exec(e.reason);
      return { ...e, reason: closedShort ? closedShort[0] : "" };
    });
}
