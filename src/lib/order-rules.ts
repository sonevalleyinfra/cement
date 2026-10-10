/**
 * Order rules as plain functions (no database, no request) so they are easy to test.
 * Source: docs/idea.md section 4 (Order Flow) and section 3 (Roles).
 *
 * Choices where the spec is silent (simplest option taken):
 * - Statuses are the spec's flow words, plus "cancelled" and "partly_dispatched"
 *   (needed for "Partial dispatch allowed").
 * - Rate filling (placed -> rate_filled) is done by sales; admin can do anything.
 * - Approve / reject is accounts; the next step "assigned" is automatic after
 *   approval, so we let accounts (and admin) trigger it. Approval picks a logistics
 *   person by round robin (spec 4.5) in the same step; if nobody is free the order
 *   stays "approved" and the first logistics person who dispatches it takes it.
 * - Dispatch and delivery are logistics work.
 * - Cancel is allowed until the order is fully dispatched. It never moves stock.
 *   Before approval nothing was billed. Approved or assigned with nothing sent: the whole
 *   bill is reversed. Partly dispatched (owner's decision): "close short" - the bags already
 *   sent stay at the shop and stay billed (each load at its own truck rate), only the bags
 *   not sent are taken off the bill at the order rate, and the order becomes "dispatched"
 *   (so it can still be marked delivered).
 * - Cancel before approval: sales or admin (a retailer cannot cancel). After approval
 *   (close short included): accounts or admin.
 * - Order value = each load at its own rate (the order rate if the truck kept it) + bags not
 *   sent yet at the order rate. Once an order is dispatched, delivered or cancelled the bags
 *   not sent are no longer counted (they were closed short or never billed).
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

/** Statuses after approval, where cancelling reverses the bill (and may close short). */
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

export type CancelPlan =
  | {
      ok: true;
      /** "dispatched" when the order is closed short. */
      newStatus: "cancelled" | "dispatched";
      /** Signed paise for one compensating ledger entry (0 = post nothing). */
      ledgerPaise: number;
      /** Reason saved on the history row. */
      historyReason: string;
      /** Bags not sent when closing short (for the notification), else null. */
      closedShortBags: number | null;
    }
  | { ok: false; error: string };

/**
 * The whole cancel decision. No stock ever moves (bags already sent are at the shop).
 * - Before approval: cancelled, nothing billed (postedNetPaise is 0 then).
 * - Approved or assigned, nothing sent: cancelled, the whole net bill is reversed.
 * - Some bags sent: closed short. Only the bags not sent come off the bill, at the order rate.
 */
export function planCancel(input: {
  status: string;
  orderedBags: number;
  dispatchedBags: number;
  /** Order rate per bag (paise); needed to close short. */
  ratePaise: number | null;
  /** Net of everything already posted to the ledger for this order. */
  postedNetPaise: number;
  reason: string | null | undefined;
}): CancelPlan {
  const { status, orderedBags, ratePaise, postedNetPaise } = input;
  if (!isOrderStatus(status) || !canTransition(status, "cancelled")) {
    return { ok: false, error: `An order that is ${status.replace("_", " ")} cannot be cancelled.` };
  }
  if (!isValidReason(input.reason)) return { ok: false, error: "Enter a reason for cancelling." };
  const why = (input.reason as string).trim().slice(0, 300);
  const sent = Math.max(0, input.dispatchedBags);

  if (sent === 0 || !AFTER_APPROVAL.includes(status)) {
    return { ok: true, newStatus: "cancelled", ledgerPaise: 0 - postedNetPaise, historyReason: why, closedShortBags: null };
  }
  const notSent = remainingBags(orderedBags, sent);
  if (notSent === 0) return { ok: false, error: "Every bag is already dispatched." };
  if (ratePaise === null || !isValidRatePaise(ratePaise)) {
    return { ok: false, error: "This order has no rate, so it cannot be closed short." };
  }
  return {
    ok: true,
    newStatus: "dispatched",
    ledgerPaise: -orderTotalPaise(notSent, ratePaise),
    historyReason: `Closed short: ${notSent} ${notSent === 1 ? "bag" : "bags"} not sent. ${why}`,
    closedShortBags: notSent,
  };
}

/** True when cancelling this order now means closing it short (some bags already sent). */
export function isCloseShort(status: string, dispatchedBags: number): boolean {
  return isOrderStatus(status) && AFTER_APPROVAL.includes(status) && dispatchedBags > 0;
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

/** Statuses where the bags not sent will never be sent (closed short, or never billed). */
const NO_MORE_LOADS: readonly OrderStatus[] = ["dispatched", "delivered", "cancelled"];

/**
 * What the order is worth to staff, in paise: every load at its own rate (null = the
 * order rate) plus the bags not sent yet at the order rate. Null when there is no rate yet.
 */
export function orderValuePaise(order: {
  status: string;
  bags: number;
  ratePaise: number | null;
  loads: readonly { bags: number; ratePaise: number | null }[];
}): number | null {
  if (order.ratePaise === null) return null;
  const rate = order.ratePaise;
  let total = 0;
  let sent = 0;
  for (const l of order.loads) {
    total += orderTotalPaise(l.bags, l.ratePaise ?? rate);
    sent += l.bags;
  }
  const closed = isOrderStatus(order.status) && NO_MORE_LOADS.includes(order.status);
  if (!closed) total += orderTotalPaise(remainingBags(order.bags, sent), rate);
  return total;
}

/* ---------- Round-robin assignment ---------- */

/** Status and history steps when an order is approved: straight on to "assigned" if someone was picked. */
export function approvalSteps(assigneeId: string | null): {
  status: "approved" | "assigned";
  steps: ("approved" | "assigned")[];
} {
  return assigneeId ? { status: "assigned", steps: ["approved", "assigned"] } : { status: "approved", steps: ["approved"] };
}

export type Assignee = { id: string; active: boolean };

/** Who the history row for one approval step records as picked: only the "assigned" step has one. */
export function approvalStepAssignee(step: "approved" | "assigned", assigneeId: string | null): string | null {
  return step === "assigned" ? assigneeId : null;
}

/**
 * Round robin's "last": who approval's round robin picked most recently.
 * Only rows with an assignee count (approval writes it); a dispatch take-over or an order
 * someone took at dispatch has none, so it does not move the turn. Null when there is none.
 */
export function lastRoundRobinAssignee(
  rows: readonly { assigneeId: string | null; createdAt: Date }[],
): string | null {
  let last: { assigneeId: string; createdAt: Date } | null = null;
  for (const r of rows) {
    if (r.assigneeId && (!last || r.createdAt.getTime() > last.createdAt.getTime())) {
      last = { assigneeId: r.assigneeId, createdAt: r.createdAt };
    }
  }
  return last?.assigneeId ?? null;
}

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
