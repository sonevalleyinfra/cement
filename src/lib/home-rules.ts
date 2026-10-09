/**
 * Home screen rules as plain functions (no database) so they are easy to test.
 * Source: docs/idea.md section 10 (Home Screens).
 *
 * Choices where the spec is silent:
 * - Admin sees one summary section that covers everything, instead of every role section.
 * - Other users see one section per role they hold, in this order: sales, accounts,
 *   logistics, retailer. A user with no known role sees no sections.
 * - "Today" is the calendar day in India (IST), starting at 00:00 IST.
 * - Dues add up each retailer's positive balance per firm (an advance with one firm
 *   does not cancel what is owed to another).
 * - Cash in hand = cash collected - handovers confirmed (pending requests still count as in hand).
 * - Logistics "Ready" = approved or assigned orders they may dispatch (their own, unassigned, or
 *   whose assignee can no longer do it); "Partly sent" = partly dispatched ones. Same rule as
 *   the dispatch list (ordersUserMayDispatch in dispatch-rules.ts).
 */
import { toISTDateKey } from "./datetime";
import { duesFrom, type LedgerEntry } from "./ledger-rules";
import { isAdmin, parseRoles } from "./roles";

export const HOME_SECTIONS = ["sales", "accounts", "logistics", "retailer", "admin"] as const;
export type HomeSection = (typeof HOME_SECTIONS)[number];

/** Which sections to show, in order, for a stored role string. */
export function homeSections(role: string | null | undefined): HomeSection[] {
  if (isAdmin(role)) return ["admin"];
  const roles = parseRoles(role);
  return HOME_SECTIONS.filter((s) => s !== "admin" && roles.includes(s));
}

/** The moment today started in India, as a Date (00:00 IST of the IST calendar day of `now`). */
export function istDayStart(now: Date): Date {
  return new Date(`${toISTDateKey(now)}T00:00:00+05:30`);
}

type BalanceRow = Pick<LedgerEntry, "amountPaise"> & { retailerId: string; firmId: string };

/** Net balance per retailer and firm (input rows may repeat the pair). */
function pairBalances(rows: readonly BalanceRow[]): Map<string, { retailerId: string; paise: number }> {
  const map = new Map<string, { retailerId: string; paise: number }>();
  for (const r of rows) {
    const key = `${r.retailerId}|${r.firmId}`;
    const cur = map.get(key) ?? { retailerId: r.retailerId, paise: 0 };
    cur.paise += r.amountPaise;
    map.set(key, cur);
  }
  return map;
}

/** Total dues in paise: sum of positive balances per retailer and firm. */
export function totalDuesPaise(rows: readonly BalanceRow[]): number {
  let total = 0;
  for (const { paise } of pairBalances(rows).values()) total += duesFrom(paise);
  return total;
}

/** How many different retailers owe something to at least one firm. */
export function retailersWithDues(rows: readonly BalanceRow[]): number {
  const set = new Set<string>();
  for (const { retailerId, paise } of pairBalances(rows).values()) if (paise > 0) set.add(retailerId);
  return set.size;
}

/** Cash collectors should still be holding: collected - reversed receipts - confirmed handovers. */
export function cashInHandPaise(collectedPaise: number, confirmedPaise: number, reversedPaise = 0): number {
  return collectedPaise - reversedPaise - confirmedPaise;
}

/** Orders that are not finished (a retailer's "open orders"). */
const CLOSED = ["rejected", "delivered", "cancelled"];
export function isOpenOrderStatus(status: string): boolean {
  return !CLOSED.includes(status);
}

/** Logistics home numbers from the orders this person may dispatch. */
export function logisticsCounts(orders: readonly { status: string }[]): { ready: number; partly: number } {
  let ready = 0;
  let partly = 0;
  for (const o of orders) {
    if (o.status === "approved" || o.status === "assigned") ready++;
    else if (o.status === "partly_dispatched") partly++;
  }
  return { ready, partly };
}
