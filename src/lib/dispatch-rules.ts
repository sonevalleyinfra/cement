/**
 * Dispatch rules as plain functions (no database, no request).
 * Source: docs/idea.md section 4 (dispatch, partial dispatch, rate edit, cancel).
 * Quantity, status and cancel rules live in order-rules.ts; stock rules in stock-rules.ts.
 * They are reused here, not repeated.
 *
 * Choices where the spec is silent (simplest option taken):
 * - Logistics can dispatch an approved, assigned or partly dispatched order. An order that
 *   is only "approved" (nobody was free to assign at approval) is moved through "assigned"
 *   and the person dispatching it becomes its assignee.
 * - Who may dispatch (spec 3: "Dispatch assigned orders"): admin always; a logistics person
 *   when the order is theirs, has nobody yet, or its assignee can no longer do it (banned or
 *   lost the logistics role). Then they take it over.
 *   The same rule decides who may mark it delivered and which orders the dispatch list shows.
 * - Round robin candidates: everyone with the logistics role, in user id order.
 *   Banned people stay in the list as inactive so the turn order holds.
 * - "Mark delivered" is only for an order that is fully dispatched.
 * - A rate edit is a different rate than the order's rate, needs a reason and is for that
 *   truck only (owner's decision): the order rate stays for the other trucks.
 * - History rows for a rate edit say "Rate edited: <reason>" and never the price itself.
 */
import {
  checkDispatchBags,
  isOrderStatus,
  isValidRatePaise,
  statusAfterDispatch,
  type Assignee,
  type OrderStatus,
} from "./order-rules";
import { hasRole, isAdmin } from "./roles";
import { canDispatch, parsePlaceKey, type PlaceRef } from "./stock-rules";
import { checkTruck } from "./vehicle-rules";

const DISPATCHABLE: readonly OrderStatus[] = ["approved", "assigned", "partly_dispatched"];

export function isDispatchable(status: string): boolean {
  return isOrderStatus(status) && DISPATCHABLE.includes(status);
}

/** Only a fully dispatched order can be marked delivered. */
export function canMarkDelivered(status: string): boolean {
  return status === "dispatched";
}

/** Someone who could be (or is) the logistics assignee of an order. */
export type LogisticsPerson = {
  id: string;
  role: string | null | undefined;
  banned: boolean | null | undefined;
};

/** Can this person still be the assignee of an order? */
export function isValidAssignee(person: LogisticsPerson | null | undefined): boolean {
  return !!person && !person.banned && hasRole(person.role, "logistics");
}

/** Ids of the people who can still be the assignee of an order. */
export function validAssigneeIds(people: readonly LogisticsPerson[]): Set<string> {
  return new Set(people.filter((p) => isValidAssignee(p)).map((p) => p.id));
}

/** Round robin list: logistics people, by user id. Banned = inactive. */
export function logisticsCandidates(people: readonly LogisticsPerson[]): Assignee[] {
  return people
    .filter((p) => hasRole(p.role, "logistics"))
    .map((p) => ({ id: p.id, active: !p.banned }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * May this user dispatch (or mark delivered) this order? Admin always. Logistics when the
 * order is theirs, unassigned, or its assignee is no longer valid.
 */
export function canDispatchOrder(
  user: { id: string; role: string | null | undefined },
  order: { logisticsId: string | null },
  assigneeStillValid: boolean,
): boolean {
  if (isAdmin(user.role)) return true;
  if (!hasRole(user.role, "logistics")) return false;
  return order.logisticsId === null || order.logisticsId === user.id || !assigneeStillValid;
}

/**
 * The orders this user may dispatch, out of `orders` (dispatch list and logistics home).
 * `people` = the staff who could be assignees (to judge whether an assignee is still valid).
 */
export function ordersUserMayDispatch<T extends { logisticsId: string | null }>(
  user: { id: string; role: string | null | undefined },
  orders: readonly T[],
  people: readonly LogisticsPerson[],
): T[] {
  return orders.filter((o) => {
    const assignee = o.logisticsId ? people.find((p) => p.id === o.logisticsId) : null;
    return canDispatchOrder(user, o, isValidAssignee(assignee));
  });
}

/** Assignee after a dispatch: the dispatcher takes an order that had nobody (or nobody valid). */
export function assigneeAfterDispatch(
  logisticsId: string | null,
  dispatcherId: string,
  assigneeStillValid: boolean,
): string {
  return logisticsId !== null && assigneeStillValid ? logisticsId : dispatcherId;
}

const RATE_EDIT_PREFIX = "Rate edited:";

/** History reason for a rate edit (no price in it: retailers read the history). */
export function rateEditReason(reason: string): string {
  return `${RATE_EDIT_PREFIX} ${reason}`;
}

export function isRateEditReason(reason: string | null | undefined): boolean {
  return (reason ?? "").startsWith(RATE_EDIT_PREFIX);
}

export type RateEditCheck =
  | { ok: true; newRatePaise: number | null; reason: string }
  | { ok: false; error: string };

/**
 * `newRatePaise` empty (null) means no edit. A changed rate needs a valid rate and a reason.
 * Entering the same rate as now is treated as no edit.
 */
export function checkRateEdit(
  currentRatePaise: number | null,
  newRatePaise: number | null,
  reason: string | null | undefined,
): RateEditCheck {
  if (newRatePaise === null || newRatePaise === currentRatePaise) {
    return { ok: true, newRatePaise: null, reason: "" };
  }
  if (!isValidRatePaise(newRatePaise)) return { ok: false, error: "Enter a valid rate per bag." };
  const why = (reason ?? "").trim();
  if (!why) return { ok: false, error: "Enter a reason for changing the rate." };
  return { ok: true, newRatePaise, reason: why.slice(0, 300) };
}

export type DispatchInput = {
  /** The truck number as typed; trucks are not saved. */
  vehicleNumber: string;
  /** Where the bags come from: a place key ("godown:<id>" / "vehicle:<id>"). */
  fromPlace: string | null;
  driverName: string;
  driverPhone: string;
};

/** Checks the sheet fields: the stock place, then the typed truck (see `checkTruck`). */
export function checkDispatchFields(
  input: DispatchInput,
):
  | { ok: true; from: PlaceRef; vehicleNumber: string; driverName: string; driverPhone: string }
  | { ok: false; error: string } {
  const from = parsePlaceKey(input.fromPlace);
  if (!from) return { ok: false, error: "Pick where the bags are coming from." };
  const truck = checkTruck({ number: input.vehicleNumber, driverName: input.driverName, driverPhone: input.driverPhone });
  if (!truck.ok) return truck;
  return {
    ok: true,
    from,
    vehicleNumber: truck.value.number,
    driverName: truck.value.driverName,
    driverPhone: truck.value.driverPhone,
  };
}

export type DispatchPlan =
  | { ok: true; newStatus: "partly_dispatched" | "dispatched"; statusSteps: OrderStatus[] }
  | { ok: false; error: string };

/**
 * Whole dispatch decision: status allows it, bags fit the order, stock in the chosen
 * place covers it. `statusSteps` are the history rows to write
 * (an "approved" order passes through "assigned" first).
 */
export function planDispatch(input: {
  status: string;
  orderedBags: number;
  alreadyDispatchedBags: number;
  bags: number;
  stockBalance: number;
}): DispatchPlan {
  if (!isDispatchable(input.status)) {
    return { ok: false, error: "This order is not ready to dispatch." };
  }
  const qty = checkDispatchBags(input.orderedBags, input.alreadyDispatchedBags, input.bags);
  if (!qty.ok) return qty;
  const stock = canDispatch(input.stockBalance, input.bags);
  if (!stock.ok) return stock;
  const newStatus = statusAfterDispatch(input.orderedBags, input.alreadyDispatchedBags + input.bags);
  const steps: OrderStatus[] = input.status === "approved" ? ["assigned", newStatus] : [newStatus];
  return { ok: true, newStatus, statusSteps: steps };
}

/**
 * Timestamps for history rows saved together in one transaction. The database gives them all the
 * same time, so the history cannot tell which came first; this spaces them 1 ms apart, in order.
 */
export function stepTimes(base: Date, count: number): Date[] {
  return Array.from({ length: count }, (_, i) => new Date(base.getTime() + i));
}
