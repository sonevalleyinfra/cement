/**
 * Home screen rules as plain functions (no database) so they are easy to test.
 * Source: docs/idea.md section 10 (Home Screens).
 *
 * Choices where the spec is silent:
 * - Admin sees one summary section that covers everything, instead of every role section.
 * - Other users see one section per role they hold, in this order: sales, accounts,
 *   logistics, retailer. A user with no known role sees no sections.
 * - Every staff member (admin too, since anyone on staff may take cash) also gets one
 *   "cash" section at the end: my cash held. It is shown once, even with several roles.
 * - "Today" is the calendar day in India (IST), starting at 00:00 IST.
 * - Dues add up each retailer's positive balance (one retailer's advance does not
 *   cancel what another retailer owes).
 * - Cash held = cash collected - reversed - handovers confirmed (requests still waiting count as held).
 * - Logistics "Ready" = approved orders; "Partly sent" = partly dispatched ones. Any logistics
 *   person may dispatch any of them (same list as the dispatch screen). Below that, each truck
 *   holding bags now (truck stock), not the stock of every place.
 * - Retailer "My payments: Last" = the newest payment that still stands (not rejected or reversed).
 */
import { toISTDateKey } from "./datetime";
import { duesFrom, type LedgerEntry } from "./ledger-rules";
import { isFinalStatus, isOrderStatus } from "./order-rules";
import { isStaff } from "./permissions";
import { isAdmin, parseRoles } from "./roles";

export const HOME_SECTIONS = ["sales", "accounts", "logistics", "retailer", "admin", "cash"] as const;
export type HomeSection = (typeof HOME_SECTIONS)[number];

/** Which sections to show, in order, for a stored role string. */
export function homeSections(role: string | null | undefined): HomeSection[] {
  const cash: HomeSection[] = isStaff(role) ? ["cash"] : [];
  if (isAdmin(role)) return ["admin", ...cash];
  const roles = parseRoles(role);
  return [...HOME_SECTIONS.filter((s) => s !== "admin" && s !== "cash" && roles.includes(s)), ...cash];
}

/** The moment today started in India, as a Date (00:00 IST of the IST calendar day of `now`). */
export function istDayStart(now: Date): Date {
  return new Date(`${toISTDateKey(now)}T00:00:00+05:30`);
}

type BalanceRow = Pick<LedgerEntry, "amountPaise"> & { retailerId: string };

/** Net balance per retailer (input rows may repeat a retailer). */
function retailerBalances(rows: readonly BalanceRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.retailerId, (map.get(r.retailerId) ?? 0) + r.amountPaise);
  return map;
}

/** Total dues in paise: sum of positive balances per retailer. */
export function totalDuesPaise(rows: readonly BalanceRow[]): number {
  let total = 0;
  for (const paise of retailerBalances(rows).values()) total += duesFrom(paise);
  return total;
}

/** How many different retailers owe something. */
export function retailersWithDues(rows: readonly BalanceRow[]): number {
  let count = 0;
  for (const paise of retailerBalances(rows).values()) if (paise > 0) count++;
  return count;
}

/** Cash staff should still be holding: collected - reversed payments - confirmed handovers. */
export function cashInHandPaise(collectedPaise: number, confirmedPaise: number, reversedPaise = 0): number {
  return collectedPaise - reversedPaise - confirmedPaise;
}

/** Orders that are not finished (a retailer's "open orders"): not rejected, dispatched or cancelled. */
export function isOpenOrderStatus(status: string): boolean {
  return isOrderStatus(status) && !isFinalStatus(status);
}

/** Logistics home numbers from the approved and partly dispatched orders. */
export function logisticsCounts(orders: readonly { status: string }[]): { ready: number; partly: number } {
  let ready = 0;
  let partly = 0;
  for (const o of orders) {
    if (o.status === "approved") ready++;
    else if (o.status === "partly_dispatched") partly++;
  }
  return { ready, partly };
}

export type TruckLoad = { truck: string; bags: number; products: { name: string; bags: number }[] };

/**
 * Logistics home "truck stock" (spec section 10): every truck holding bags now, by number, with its
 * bags per product (biggest first). Rows are bags per product per place; godowns and empty lines are left out.
 */
export function truckLoads(
  rows: readonly { kind: string; placeKey: string; placeName: string; productName: string; bags: number }[],
): TruckLoad[] {
  const trucks = new Map<string, TruckLoad>();
  for (const r of rows) {
    if (r.kind !== "vehicle" || r.bags === 0) continue;
    const t = trucks.get(r.placeKey) ?? { truck: r.placeName, bags: 0, products: [] };
    t.bags += r.bags;
    const line = t.products.find((p) => p.name === r.productName);
    if (line) line.bags += r.bags;
    else t.products.push({ name: r.productName, bags: r.bags });
    trucks.set(r.placeKey, t);
  }
  return [...trucks.values()]
    .filter((t) => t.bags > 0)
    .map((t) => ({ ...t, products: t.products.filter((p) => p.bags !== 0).sort((a, b) => b.bags - a.bags || a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.truck.localeCompare(b.truck));
}

/**
 * A switched-on shop with no sales person (its orders would otherwise wait on nobody).
 * When `activeRepIds` is given, a sales person who is deactivated counts as nobody too.
 */
export function needsSalesRep(
  shop: { active: boolean; salesRepId: string | null },
  activeRepIds?: ReadonlySet<string>,
): boolean {
  if (!shop.active) return false;
  if (!shop.salesRepId) return true;
  return activeRepIds !== undefined && !activeRepIds.has(shop.salesRepId);
}

/** Admin home: how many shops need a sales person. Tapping it opens `/retailers?filter=no-rep` (only those shops). */
export function shopsWithoutSalesRep(
  shops: readonly { active: boolean; salesRepId: string | null }[],
  activeRepIds?: ReadonlySet<string>,
): number {
  return shops.filter((s) => needsSalesRep(s, activeRepIds)).length;
}

/** The Retailers page filter in the address that shows only the shops counted above. */
export const NO_REP_FILTER = "no-rep";

/** Payments that still stand: a rejected or reversed one is not a payment the shop made. */
export const LAST_PAYMENT_SKIPS = ["rejected", "reversed"] as const;
