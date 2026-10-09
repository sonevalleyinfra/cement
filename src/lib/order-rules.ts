/**
 * Order rules as plain functions (no database, no request) so they are easy to test.
 * Source: docs/idea.md section 4 (Order Flow) and section 3 (Roles).
 *
 * Choices where the spec is silent (simplest option taken):
 * - Statuses are the spec's flow words, plus "cancelled" and "partly_dispatched"
 *   (needed for "Partial dispatch allowed").
 * - Rate filling (placed -> rate_filled) is done by sales; admin can do anything.
 * - Approve / reject is accounts; the next step "assigned" is automatic after
 *   approval, so we let accounts (and admin) trigger it.
 * - Dispatch and delivery are logistics work.
 * - Cancel is allowed until the order is fully dispatched. Before approval no stock
 *   was touched. After approval, stock is reversed only for bags already dispatched.
 * - Cancel before approval: sales or admin (a retailer cannot cancel). After approval:
 *   accounts or admin.
 * - Admin passes every role check (same as hasAnyRole in roles.ts).
 * - Money is integer paise only.
 */
import { hasAnyRole, type Role } from "./roles";

export const ORDER_STATUSES = [
  "placed",
  "rate_filled",
  "approved",
  "rejected",
  "assigned",
  "partly_dispatched",
  "dispatched",
  "delivered",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

/** Which statuses an order may move to from each status. */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  placed: ["rate_filled", "cancelled"],
  rate_filled: ["approved", "rejected", "cancelled"],
  approved: ["assigned", "cancelled"],
  rejected: [],
  assigned: ["partly_dispatched", "dispatched", "cancelled"],
  // Another partial dispatch keeps the same status.
  partly_dispatched: ["partly_dispatched", "dispatched", "cancelled"],
  dispatched: ["delivered"],
  delivered: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isFinalStatus(status: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}

/** Statuses after approval, where cancelling touches stock. */
const AFTER_APPROVAL: readonly OrderStatus[] = ["approved", "assigned", "partly_dispatched"];

const BEFORE_APPROVAL_CANCEL_ROLES: readonly Role[] = ["sales"];
const AFTER_APPROVAL_CANCEL_ROLES: readonly Role[] = ["accounts"];

/** Roles allowed to make a given step (admin is always allowed). */
export function rolesForTransition(from: OrderStatus, to: OrderStatus): readonly Role[] {
  if (!canTransition(from, to)) return [];
  if (to === "cancelled") {
    return AFTER_APPROVAL.includes(from)
      ? AFTER_APPROVAL_CANCEL_ROLES
      : BEFORE_APPROVAL_CANCEL_ROLES;
  }
  switch (to) {
    case "rate_filled":
      return ["sales"];
    case "approved":
    case "rejected":
    case "assigned":
      return ["accounts"];
    case "partly_dispatched":
    case "dispatched":
    case "delivered":
      return ["logistics"];
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

/** Rejecting needs a reason (spec: "Approves or rejects with reason"). */
export function isValidReason(reason: string | null | undefined): boolean {
  return !!reason && reason.trim().length > 0;
}

/** Approval needs a rate (spec: "Rate filled ... Required before approval"). */
export function isValidRatePaise(ratePaise: number): boolean {
  return Number.isSafeInteger(ratePaise) && ratePaise > 0;
}

export type CancelDecision =
  | { ok: true; reverseStockBags: number }
  | { ok: false; error: string };

/**
 * Can this order be cancelled, and how many dispatched bags must go back to the
 * firm's stock? Nothing to reverse before approval or before any dispatch.
 */
export function cancelDecision(
  status: OrderStatus,
  dispatchedBags: number,
  reason: string | null | undefined,
): CancelDecision {
  if (!canTransition(status, "cancelled")) {
    return { ok: false, error: `An order that is ${status.replace("_", " ")} cannot be cancelled.` };
  }
  if (!isValidReason(reason)) return { ok: false, error: "Enter a reason for cancelling." };
  const reverse = AFTER_APPROVAL.includes(status) ? Math.max(0, dispatchedBags) : 0;
  return { ok: true, reverseStockBags: reverse };
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
  if (bags > left) return { ok: false, error: `Only ${left} bags are left to dispatch.` };
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

/* ---------- Round-robin assignment ---------- */

export type Assignee = { id: string; active: boolean };

/**
 * Next logistics member after `lastAssignedId`, in the given (stable) list order,
 * wrapping around and skipping inactive people. Returns null if nobody is active.
 * If the last one is unknown (or no longer in the list), starts from the first.
 */
export function pickNextAssignee(
  candidates: readonly Assignee[],
  lastAssignedId: string | null | undefined,
): string | null {
  if (candidates.length === 0) return null;
  const lastIndex = lastAssignedId ? candidates.findIndex((c) => c.id === lastAssignedId) : -1;
  for (let step = 1; step <= candidates.length; step++) {
    const c = candidates[(lastIndex + step + candidates.length) % candidates.length];
    if (c.active) return c.id;
  }
  return null;
}
