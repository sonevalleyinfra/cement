/**
 * Who may place orders, who sees prices, and which orders a person sees.
 * Plain functions (no database) so they are easy to test.
 *
 * Default deny: only staff (a known staff role or admin, see isStaff) see prices and every order.
 * Anyone else (a retailer, or a login with no known role) is price-blind and sees only their own
 * shop's orders, if any. A retailer cannot also hold a staff role (checkRoles in user-admin-rules).
 * Choices where the spec is silent:
 * - A non-staff viewer sees the order history without rate rows (filled / edited), and a staff
 *   reason that talks about money (rate, price, ₹, rs, discount...) is hidden. A reason code's label
 *   shows only when it is shop-visible (reason-codes isShopVisibleReason; "Over limit" never does).
 * - The staff note of an order is never sent to a non-staff viewer (order-delivery-rules notesForViewer).
 * - Dispatch loads (bags, vehicle, driver, phone, date) are shown to everyone who may see the
 *   order; the load's rate only to staff.
 */
import { formatINR } from "./money";
import { isOrderStatus, isValidBags, orderTotalPaise, orderValuePaise, remainingBags } from "./order-rules";
import { isStaff } from "./permissions";
import { isRateEvent, rateEventLabel, rateMoveText } from "./rate-rules";
import { isShopVisibleReason, reasonLabel } from "./reason-codes";
import { hasAnyRole, isRetailerOnly } from "./roles";
import { bagsText } from "./words";

export { isRetailerOnly };

/** Only staff see prices and amounts. Retailers, and anyone without a known staff role, never do. */
export function canSeePrice(role: string | null | undefined): boolean {
  return isStaff(role);
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

/** The retailer an order is placed for: staff choose; anyone else is fixed to their own shop. */
export function resolveOrderRetailer(
  role: string | null | undefined,
  ownRetailerId: string | null,
  chosenRetailerId: string | null,
): string | null {
  return isStaff(role) ? chosenRetailerId : ownRetailerId;
}

/** Which orders a person sees: staff every order, anyone else only their own shop's (or none). */
export function orderListScope(
  role: string | null | undefined,
  ownRetailerId: string | null,
): { kind: "all" } | { kind: "retailer"; retailerId: string } | { kind: "none" } {
  if (isStaff(role)) return { kind: "all" };
  return ownRetailerId ? { kind: "retailer", retailerId: ownRetailerId } : { kind: "none" };
}

/**
 * The line under a cancelled order that had some bags sent, e.g. "40 of 100 bags dispatched".
 * Null when it does not apply (not cancelled, or nothing was sent).
 */
export function cancelledNote(status: string, orderedBags: number, sentBags: number): string | null {
  if (status !== "cancelled" || sentBags <= 0) return null;
  return `${sentBags} of ${orderedBags} bags dispatched`;
}

export type OrderAmount = { caption: string; totalPaise: number; lines: string[] };

/**
 * The money box on an order, for staff only (a shop never sees rates or amounts). It never shows one
 * "rate per bag" that was not billed:
 * - nothing sent yet: the order's rate and the total at that rate;
 * - some sent, more to come: the total, what was billed so far, and the bags not sent at the current rate
 *   (each load shows its own rate in its own row);
 * - finished or cancelled after some bags went out: only what was billed;
 * - closed with nothing sent (rejected, cancelled): nothing (null).
 */
export function orderAmountSummary(order: {
  status: string;
  bags: number;
  ratePaise: number | null;
  loads: readonly { bags: number; ratePaise: number }[];
}): OrderAmount | null {
  const totalPaise = orderValuePaise(order);
  if (totalPaise === null) return null;
  if (order.loads.length === 0) {
    return order.ratePaise === null
      ? null
      : { caption: `Rate ${formatINR(order.ratePaise)} per bag`, totalPaise, lines: [] };
  }
  const closed = isOrderStatus(order.status) && ["rejected", "dispatched", "cancelled"].includes(order.status);
  if (closed) return { caption: "Billed", totalPaise, lines: [] };
  const billed = order.loads.reduce((n, l) => n + orderTotalPaise(l.bags, l.ratePaise), 0);
  const left = remainingBags(order.bags, order.loads.reduce((n, l) => n + l.bags, 0));
  const lines = [`Billed ${formatINR(billed)}`];
  if (left > 0 && order.ratePaise !== null) lines.push(`${bagsText(left)} not sent, at ${formatINR(order.ratePaise)} per bag`);
  return { caption: "Total", totalPaise, lines };
}

/** Words that give a price away in a free-text staff reason. */
const MONEY_WORDS = /(\brate|\bpric|₹|\brs\b|\brs\.|rupee|paise|discount|\bcost|\bamount|\/-)/i;

export function mentionsMoney(text: string | null | undefined): boolean {
  return MONEY_WORDS.test(text ?? "");
}

/**
 * The order history this person may read. Staff see everything. Anyone else does not
 * see rate rows, nor reason codes meant for staff (the code becomes null), nor notes that mention money.
 */
/**
 * A reversal's history row (v2 B2, lib/reversals.ts): "Returned 30 bags in KA01AB1234: Wrong entry · note".
 * Read from the text: its code alone is not enough ("entry_mistake" / "other" are cancel codes too).
 */
const REVERSAL_EVENT = /^Returned \d+ bags in [^:]*/;

export function isReversalEvent(reason: string): boolean {
  return REVERSAL_EVENT.test(reason);
}

export function historyForViewer<T extends { reason: string; reasonCode?: string | null }>(
  role: string | null | undefined,
  events: readonly T[],
): T[] {
  if (isStaff(role)) return [...events];
  return events
    .filter((e) => !isRateEvent(e.reason))
    .map((e) => {
      // A reversal row: the shop keeps "Returned 30 bags in <truck>" (like a load row), never the staff reason or note.
      const back = REVERSAL_EVENT.exec(e.reason);
      if (back) return { ...e, reason: back[0], reasonCode: null };
      let shown = e;
      // A staff-only code hides its note too (it was typed for staff, e.g. "Over limit · 2 lakh due").
      if (shown.reasonCode && !isShopVisibleReason(shown.reasonCode)) shown = { ...shown, reasonCode: null, reason: "" };
      if (mentionsMoney(shown.reason)) shown = { ...shown, reason: "" };
      return shown;
    });
}

/** The rate line under a rate row of the history ("₹350 → ₹360"), for staff only. Null otherwise. */
export function historyRateLine(
  role: string | null | undefined,
  event: { fromRatePaise: number | null; toRatePaise: number | null },
): string | null {
  if (!isStaff(role) || event.toRatePaise === null) return null;
  return rateMoveText(event.fromRatePaise, event.toRatePaise);
}

/**
 * The step name shown in an order's history. A rate fill or change keeps the status (for example
 * "approved" to "approved"), so it shows as "Rate filled" / "Rate edited". Other rows show their
 * new status ("partly_dispatched" = "Partly dispatched").
 */
export function historyStepLabel(event: { toStatus: string; reason: string }): string {
  const rate = rateEventLabel(event.reason);
  if (rate) return rate;
  // Not "Approved" / "Partly dispatched": the order was not decided again, bags came back.
  if (isReversalEvent(event.reason)) return "Bags returned";
  const words = event.toStatus.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The reason line under a history row: the code's label, then " · note" (a rate row already says
 * "Rate edited" in its label, so only its note is kept). Old rows without a code show their text.
 */
export function historyReason(event: { reason: string; reasonCode?: string | null }): string {
  const { reason } = event;
  let note = reason;
  // A reversal row's text already names its reason ("Returned 30 bags in X: Wrong entry").
  if (isReversalEvent(reason)) return reason.trim();
  if (reason.startsWith("Rate edited: ")) note = reason.slice("Rate edited: ".length);
  else if (isRateEvent(reason)) note = "";
  return [reasonLabel(event.reasonCode), note.trim()].filter(Boolean).join(" · ");
}
