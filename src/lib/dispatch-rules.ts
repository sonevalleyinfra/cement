/**
 * Dispatch rules as plain functions (no database, no request).
 * Source: docs/idea.md section 4 (dispatch, partial dispatch, rate edit, cancel).
 * Quantity, status and cancel rules live in order-rules.ts; stock rules in stock-rules.ts.
 * They are reused here, not repeated.
 *
 * Choices where the spec is silent (simplest option taken):
 * - Logistics can dispatch an approved, assigned or partly dispatched order. An order that
 *   is only "approved" is moved through "assigned" automatically (assignment is not tracked).
 * - "Mark delivered" is only for an order that is fully dispatched.
 * - A rate edit is a different rate than the order's current one and needs a reason.
 */
import { checkDispatchBags, isOrderStatus, isValidRatePaise, statusAfterDispatch, type OrderStatus } from "./order-rules";
import { isValidIndianMobile, normalizePhone } from "./retailer-rules";
import { canDispatch } from "./stock-rules";

const DISPATCHABLE: readonly OrderStatus[] = ["approved", "assigned", "partly_dispatched"];

export function isDispatchable(status: string): boolean {
  return isOrderStatus(status) && DISPATCHABLE.includes(status);
}

/** Only a fully dispatched order can be marked delivered. */
export function canMarkDelivered(status: string): boolean {
  return status === "dispatched";
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
  readOnlyMode: boolean;
  vehicleId: string | null;
  locationId: string | null;
  driverName: string;
  driverPhone: string;
};

/** Checks the sheet fields. Driver phone is optional, but must be a 10-digit mobile when given. */
export function checkDispatchFields(
  input: DispatchInput,
): { ok: true; driverName: string; driverPhone: string } | { ok: false; error: string } {
  if (input.readOnlyMode) return { ok: false, error: "Pick one firm to dispatch." };
  if (!input.vehicleId) return { ok: false, error: "Pick a vehicle." };
  if (!input.locationId) return { ok: false, error: "Pick where the bags are coming from." };
  const driverName = input.driverName.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!driverName) return { ok: false, error: "Enter the driver name." };
  const driverPhone = normalizePhone(input.driverPhone);
  if (driverPhone && !isValidIndianMobile(driverPhone)) {
    return { ok: false, error: "Enter a 10-digit driver mobile." };
  }
  return { ok: true, driverName, driverPhone };
}

export type DispatchPlan =
  | { ok: true; newStatus: "partly_dispatched" | "dispatched"; statusSteps: OrderStatus[] }
  | { ok: false; error: string };

/**
 * Whole dispatch decision: status allows it, bags fit the order, stock in the chosen
 * location (same firm) covers it. `statusSteps` are the history rows to write
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
