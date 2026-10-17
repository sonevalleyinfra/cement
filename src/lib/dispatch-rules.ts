/**
 * Dispatch rules as plain functions (no database, no request).
 * Source: docs/idea.md section 3 (Order flow, dispatch).
 * Quantity and status rules live in order-rules.ts; stock rules in stock-rules.ts. They are reused here.
 *
 * - Any logistics person (or admin) may dispatch any approved or partly dispatched order.
 * - The bags come from a godown or a truck that holds enough of that product.
 * - Each dispatch bills its bags x the order's rate at that moment (the rate is saved on the dispatch).
 */
import { checkDispatchBags, isOrderStatus, isValidRatePaise, statusAfterDispatch, type OrderStatus } from "./order-rules";
import { orderDebitPaise } from "./ledger-rules";
import { canDispatch, parsePlaceKey, type PlaceRef } from "./stock-rules";
import { checkTruck } from "./vehicle-rules";

const DISPATCHABLE: readonly OrderStatus[] = ["approved", "partly_dispatched"];

export function isDispatchable(status: string): boolean {
  return isOrderStatus(status) && DISPATCHABLE.includes(status);
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
  | {
      ok: true;
      newStatus: "partly_dispatched" | "dispatched";
      /** The rate billed for these bags (the order's rate now). */
      ratePaise: number;
      /** What this dispatch adds to the retailer's dues: bags x rate. */
      amountPaise: number;
    }
  | { ok: false; error: string };

/**
 * Whole dispatch decision: status allows it, the order has a rate, bags fit the order,
 * and stock in the chosen place covers it.
 */
export function planDispatch(input: {
  status: string;
  orderedBags: number;
  alreadyDispatchedBags: number;
  bags: number;
  ratePaise: number | null;
  stockBalance: number;
}): DispatchPlan {
  if (!isDispatchable(input.status)) {
    return { ok: false, error: "This order is not ready to dispatch." };
  }
  if (input.ratePaise === null || !isValidRatePaise(input.ratePaise)) {
    return { ok: false, error: "This order has no rate yet." };
  }
  const qty = checkDispatchBags(input.orderedBags, input.alreadyDispatchedBags, input.bags);
  if (!qty.ok) return qty;
  const stock = canDispatch(input.stockBalance, input.bags);
  if (!stock.ok) return stock;
  const amountPaise = orderDebitPaise(input.bags, input.ratePaise);
  if (amountPaise === null) return { ok: false, error: "That amount is too large." };
  return {
    ok: true,
    newStatus: statusAfterDispatch(input.orderedBags, input.alreadyDispatchedBags + input.bags),
    ratePaise: input.ratePaise,
    amountPaise,
  };
}

/**
 * The truck number box after "Take from" changes. Bags already on a truck usually leave on that
 * truck, so picking a truck fills in its number. Picking a godown keeps what was typed; only a number
 * that was filled in from a truck (not typed) is cleared. `autoFilled` is the number last filled in.
 */
export function truckAfterPlacePick(
  current: string,
  autoFilled: string | null,
  pickedTruck: string | null,
): { truck: string; autoFilled: string | null } {
  if (pickedTruck) return { truck: pickedTruck, autoFilled: pickedTruck };
  if (autoFilled !== null && current === autoFilled) return { truck: "", autoFilled: null };
  return { truck: current, autoFilled: null };
}

type StockPlace = { key: string; name: string; truck: string | null };
type StockBalance = { productId: string; placeKey: string; bags: number };

/**
 * The "Take from" list for one product: only places holding at least `bags` of it
 * (a place with 0 bags, or fewer than asked, could never cover the dispatch).
 * `bags` below 1 counts as 1, so an empty box still hides empty places.
 */
export function placesWithEnough<P extends StockPlace>(
  places: readonly P[],
  balances: readonly StockBalance[],
  productId: string,
  bags: number,
): (P & { bagsHere: number })[] {
  const need = Number.isFinite(bags) && bags > 1 ? Math.floor(bags) : 1;
  return places
    .map((p) => ({
      ...p,
      bagsHere: balances.filter((b) => b.productId === productId && b.placeKey === p.key).reduce((s, b) => s + b.bags, 0),
    }))
    .filter((p) => p.bagsHere >= need);
}

export type TruckChip = { truck: string; driverName: string; driverPhone: string };

/** How many truck chips the dispatch sheet shows. */
export const MAX_TRUCK_CHIPS = 6;

/**
 * Chips for the dispatch sheet: trucks holding bags now first (they usually leave as they are),
 * then trucks from recent dispatches, newest first. One chip per truck number; a recent dispatch
 * supplies the driver. `recent` must be newest first.
 */
export function truckChips(loaded: readonly string[], recent: readonly TruckChip[], max = MAX_TRUCK_CHIPS): TruckChip[] {
  const lastFor = new Map<string, TruckChip>();
  for (const r of recent) if (!lastFor.has(r.truck)) lastFor.set(r.truck, r);
  const out: TruckChip[] = [];
  const seen = new Set<string>();
  const add = (truck: string) => {
    if (seen.has(truck) || out.length >= max) return;
    seen.add(truck);
    out.push(lastFor.get(truck) ?? { truck, driverName: "", driverPhone: "" });
  };
  loaded.forEach(add);
  recent.forEach((r) => add(r.truck));
  return out;
}
