/**
 * Who may place orders, who sees prices, and which orders a person sees.
 * Plain functions (no database) so they are easy to test.
 *
 * Choices where the spec is silent:
 * - A person with the retailer role AND any staff role counts as staff.
 * - Only a pure retailer is price-blind and limited to their own shop's orders.
 * - A pure retailer sees the order history without rate rows (filled / edited), and a staff
 *   reason that talks about money (rate, price, ₹, rs, discount...) is hidden.
 * - Dispatch loads (bags, vehicle, driver, phone, date) are shown to everyone who may see the
 *   order; the load's rate only to staff.
 */
import { hasAnyRole, isRetailerOnly } from "./roles";
import { isValidBags, type OrderStatus } from "./order-rules";
import { isRateEvent, rateEventLabel } from "./rate-rules";

export { isRetailerOnly };

/** Retailers never see prices or amounts. Everyone else does. */
export function canSeePrice(role: string | null | undefined): boolean {
  return !isRetailerOnly(role);
}

/** Sales, retailers and admin may place orders. */
export function canPlaceOrder(role: string | null | undefined): boolean {
  return hasAnyRole(role, ["sales", "retailer"]);
}

export type PlaceOrderInput = {
  bags: number;
  retailerId: string | null;
  productId: string | null;
};

/** Checks a new order before saving. Returns the first problem found. */
export function validatePlaceOrder(
  input: PlaceOrderInput,
): { ok: true } | { ok: false; error: string } {
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

/** Which order filter applies: a pure retailer sees only their shop, others see every order. */
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

/** Maps the order status to the colours the status chip knows. */
export function chipStatus(status: OrderStatus): "pending" | "approved" | "rejected" | "dispatched" {
  switch (status) {
    case "placed":
      return "pending";
    case "approved":
      return "approved";
    case "rejected":
    case "cancelled":
      return "rejected";
    case "partly_dispatched":
    case "dispatched":
      return "dispatched";
  }
}

/**
 * The line under a cancelled order that had some bags sent, e.g. "40 of 100 bags dispatched".
 * Null when it does not apply (not cancelled, or nothing was sent).
 */
export function cancelledNote(status: string, orderedBags: number, sentBags: number): string | null {
  if (status !== "cancelled" || sentBags <= 0) return null;
  return `${sentBags} of ${orderedBags} bags dispatched`;
}

/** Words that give a price away in a free-text staff reason. */
const MONEY_WORDS = /(\brate|\bpric|₹|\brs\b|\brs\.|rupee|paise|discount|\bcost|\bamount|\/-)/i;

export function mentionsMoney(text: string | null | undefined): boolean {
  return MONEY_WORDS.test(text ?? "");
}

/**
 * The order history this person may read. Staff see everything. A pure retailer does not
 * see rate rows, nor staff reasons that mention money.
 */
export function historyForViewer<T extends { reason: string }>(
  role: string | null | undefined,
  events: readonly T[],
): T[] {
  if (!isRetailerOnly(role)) return [...events];
  return events
    .filter((e) => !isRateEvent(e.reason))
    .map((e) => (mentionsMoney(e.reason) ? { ...e, reason: "" } : e));
}

/**
 * The step name shown in an order's history. A rate fill or change keeps the status (for example
 * "approved" to "approved"), so it shows as "Rate filled" / "Rate edited". Other rows show their
 * new status ("partly_dispatched" = "Partly dispatched").
 */
export function historyStepLabel(event: { toStatus: string; reason: string }): string {
  const rate = rateEventLabel(event.reason);
  if (rate) return rate;
  const words = event.toStatus.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The reason line under a history row (a rate row already says it in its label). */
export function historyReason(reason: string): string {
  if (reason.startsWith("Rate edited: ")) return reason.slice("Rate edited: ".length);
  return isRateEvent(reason) ? "" : reason;
}
