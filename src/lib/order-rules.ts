/**
 * Order rules as plain functions (no database, no request) so they are easy to test.
 * Source: docs/idea.md section 3 (Order flow) and section 1 (Roles).
 *
 *   Placed -> Approved / Rejected -> Partly dispatched -> Dispatched      (Cancelled by admin)
 *
 * - Approve / reject: accounts, only once the order has a rate (rate rules in rate-rules.ts).
 * - Dispatch: any logistics person. The status after a dispatch comes from the bags sent so far.
 * - Cancel: admin only, with a reason, while placed, approved or partly dispatched. Only the bags
 *   not sent yet are cancelled; bags already sent stay at the shop and stay billed.
 * - Each dispatch bills its own bags x the rate at that moment (see ledger-rules.ts), so nothing
 *   is billed before a dispatch and a cancel or rate change never needs a correction.
 * - Admin passes every role check (same as hasAnyRole in roles.ts).
 * - Money is integer paise only.
 */
import { hasAnyRole, type Role } from "./roles";
import { bagsText, isAre } from "./words";

export const ORDER_STATUSES = [
  "placed",
  "approved",
  "rejected",
  "partly_dispatched",
  "dispatched",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

/** Which statuses an order may move to from each status. */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  placed: ["approved", "rejected", "cancelled"],
  approved: ["partly_dispatched", "dispatched", "cancelled"],
  // Another partial dispatch keeps the same status.
  partly_dispatched: ["partly_dispatched", "dispatched", "cancelled"],
  rejected: [],
  dispatched: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isFinalStatus(status: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}

/** Roles allowed to make a given step (admin is always allowed, and is the only one who may cancel). */
export function rolesForTransition(from: OrderStatus, to: OrderStatus): readonly Role[] {
  if (!canTransition(from, to)) return [];
  switch (to) {
    case "approved":
    case "rejected":
      return ["accounts"];
    case "partly_dispatched":
    case "dispatched":
      return ["logistics"];
    case "cancelled":
      return ["admin"];
    default:
      return [];
  }
}

export function canUserTransition(
  role: string | null | undefined,
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  if (!canTransition(from, to)) return false;
  return hasAnyRole(role, rolesForTransition(from, to));
}

/** Reject, cancel and a rate change after approval need a reason. */
export function isValidReason(reason: string | null | undefined): boolean {
  return !!reason && reason.trim().length > 0;
}

/** A trimmed reason, cut to 300 characters. */
export function cleanReason(reason: string | null | undefined): string {
  return String(reason ?? "").trim().slice(0, 300);
}

export function isValidRatePaise(ratePaise: number): boolean {
  return Number.isSafeInteger(ratePaise) && ratePaise > 0;
}

/* ---------- Cancel ---------- */

/** Only admin cancels, while the order is placed, approved or partly dispatched. */
export function canCancelOrder(role: string | null | undefined, status: string): boolean {
  return isOrderStatus(status) && canUserTransition(role, status, "cancelled");
}

export type CancelPlan =
  | { ok: true; reason: string; cancelledBags: number }
  | { ok: false; error: string };

/**
 * The whole cancel decision. No stock moves and nothing is posted to the ledger: only dispatched
 * bags were ever billed, and they stay billed. `cancelledBags` = the bags not sent.
 */
export function planCancel(input: {
  role: string | null | undefined;
  status: string;
  orderedBags: number;
  dispatchedBags: number;
  reason: string | null | undefined;
}): CancelPlan {
  if (!isOrderStatus(input.status) || !canTransition(input.status, "cancelled")) {
    return { ok: false, error: `An order that is ${input.status.replace("_", " ")} cannot be cancelled.` };
  }
  if (!canCancelOrder(input.role, input.status)) return { ok: false, error: "Only admin can cancel an order." };
  if (!isValidReason(input.reason)) return { ok: false, error: "Enter a reason for cancelling." };
  const cancelledBags = remainingBags(input.orderedBags, input.dispatchedBags);
  if (cancelledBags === 0) return { ok: false, error: "Every bag is already dispatched." };
  return { ok: true, reason: cleanReason(input.reason), cancelledBags };
}

/* ---------- Quantity rules ---------- */

export function isValidBags(bags: number): boolean {
  return Number.isInteger(bags) && bags > 0;
}

export function remainingBags(orderedBags: number, dispatchedBags: number): number {
  return Math.max(0, orderedBags - dispatchedBags);
}

export type DispatchCheck = { ok: true; remainingAfter: number } | { ok: false; error: string };

/** Checks a new dispatch of `bags` against the order. Total dispatched never exceeds ordered. */
export function checkDispatchBags(
  orderedBags: number,
  alreadyDispatchedBags: number,
  bags: number,
): DispatchCheck {
  if (!isValidBags(bags)) return { ok: false, error: "Bags must be a whole number above zero." };
  const left = remainingBags(orderedBags, alreadyDispatchedBags);
  if (bags > left) return { ok: false, error: `Only ${bagsText(left)} ${isAre(left)} left to dispatch.` };
  return { ok: true, remainingAfter: left - bags };
}

/** Status after a dispatch: fully dispatched once nothing remains, otherwise partly. */
export function statusAfterDispatch(
  orderedBags: number,
  totalDispatchedBags: number,
): "partly_dispatched" | "dispatched" {
  return totalDispatchedBags >= orderedBags ? "dispatched" : "partly_dispatched";
}

/** Order total in paise: bags x rate per bag (both integers). */
export function orderTotalPaise(bags: number, ratePaisePerBag: number): number {
  return bags * ratePaisePerBag;
}

/** Statuses where the bags not sent will never be sent (so they are not counted in the value). */
const NO_MORE_LOADS: readonly OrderStatus[] = ["rejected", "dispatched", "cancelled"];

/**
 * What the order is worth to staff, in paise: every load at the rate it was billed at, plus the
 * bags not sent yet at the current rate (while more can still go). Null when there is no rate yet,
 * or when the order was closed (rejected / cancelled) with nothing sent.
 */
export function orderValuePaise(order: {
  status: string;
  bags: number;
  ratePaise: number | null;
  loads: readonly { bags: number; ratePaise: number }[];
}): number | null {
  let total = 0;
  let sent = 0;
  for (const l of order.loads) {
    total += orderTotalPaise(l.bags, l.ratePaise);
    sent += l.bags;
  }
  const closed = isOrderStatus(order.status) && NO_MORE_LOADS.includes(order.status);
  if (closed) return sent === 0 ? null : total;
  if (order.ratePaise === null) return null;
  return total + orderTotalPaise(remainingBags(order.bags, sent), order.ratePaise);
}
