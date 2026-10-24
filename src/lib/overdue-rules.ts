/**
 * Overdue shops (the collection call list), "Collect today" for a sales person, and the ages shown
 * on the Accounts and Logistics homes. Plain functions: no database, so they are easy to test.
 *
 * Overdue is built on the same FIFO items as the dues report (`duesFromLedger`): payments clear the
 * oldest items first, and an item is overdue when it is older than the shop's credit days (30 when
 * not set). "Days past terms" = the item's age minus the credit days (age 42, terms 30 → 12).
 *
 * Choices where the spec is silent:
 * - Ties sort by shop name.
 * - In "Collect today", switched-off shops come last in the same order (overdue first, then dues).
 * - An age under one minute reads "Oldest 1 min"; a moment in the future counts as now.
 */
import { effectiveCreditDays } from "./credit-rules";
import { toISTDateKey } from "./datetime";
import { duesFromLedger, type DueItem, type LedgerRow } from "./due-items";
import { daysBetween, istStartOf, param } from "./report-range";
import { hasRole, isAdmin } from "./roles";
import { daysText } from "./words";

export type Overdue = { duePaise: number; overduePaise: number; oldestDaysPastTerms: number };

/** What is overdue in one shop's due items (oldest first), as of the day `asOfKey` (India). */
export function overdueOf(items: readonly DueItem[], creditDays: number | null, asOfKey: string): Overdue {
  const terms = effectiveCreditDays(creditDays);
  let duePaise = 0;
  let overduePaise = 0;
  let oldest = 0;
  for (const item of items) {
    duePaise += item.duePaise;
    const pastTerms = daysBetween(toISTDateKey(item.dueSince), asOfKey) - terms;
    if (pastTerms > 0) {
      overduePaise += item.duePaise;
      oldest = Math.max(oldest, pastTerms);
    }
  }
  return { duePaise, overduePaise, oldestDaysPastTerms: oldest };
}

export type OverdueShop = {
  id: string;
  name: string;
  place: string;
  phone: string;
  creditDays: number | null;
  active: boolean;
  salesRepId: string | null;
  salesRepName: string | null;
};

export type LastPayment = { totalPaise: number; createdAt: Date };

export type OverdueRow = {
  retailerId: string;
  name: string;
  place: string;
  phone: string;
  active: boolean;
  salesRepId: string | null;
  salesRepName: string | null;
  duePaise: number;
  overduePaise: number;
  daysPastTerms: number;
  lastPayment: LastPayment | null;
};

/** One row per shop that owes something. `rows` are every ledger row, oldest first. */
export function buildOverdueRows(
  rows: readonly (LedgerRow & { retailerId: string })[],
  shops: ReadonlyMap<string, OverdueShop>,
  lastPayments: ReadonlyMap<string, LastPayment>,
  asOfKey: string,
): OverdueRow[] {
  const by = new Map<string, LedgerRow[]>();
  for (const r of rows) {
    const list = by.get(r.retailerId) ?? [];
    list.push(r);
    by.set(r.retailerId, list);
  }
  const out: OverdueRow[] = [];
  for (const [retailerId, list] of by) {
    const shop = shops.get(retailerId);
    if (!shop) continue;
    const o = overdueOf(duesFromLedger(list).items, shop.creditDays, asOfKey);
    if (o.duePaise <= 0) continue;
    out.push({
      retailerId,
      name: shop.name,
      place: shop.place,
      phone: shop.phone,
      active: shop.active,
      salesRepId: shop.salesRepId,
      salesRepName: shop.salesRepName,
      duePaise: o.duePaise,
      overduePaise: o.overduePaise,
      daysPastTerms: o.oldestDaysPastTerms,
      lastPayment: lastPayments.get(retailerId) ?? null,
    });
  }
  return out;
}

export const OVERDUE_MIN_DAYS = [30, 60, 90] as const;
export type MinDays = 0 | (typeof OVERDUE_MIN_DAYS)[number];

/** The `min` address param: 30, 60 or 90; anything else = 0 (any overdue). */
export function minDaysParam(value: string | string[] | undefined): MinDays {
  const n = Number(param(value));
  return (OVERDUE_MIN_DAYS as readonly number[]).includes(n) ? (n as MinDays) : 0;
}

export const OVERDUE_PAGE_SIZE = 100;
export const OVERDUE_MAX_ROWS = 1000;

/** The `limit` address param: a multiple of 100 from 100 to 1000 (bad input = 100, rounded up). */
export function overdueLimitParam(value: string | string[] | undefined): number {
  const n = Number.parseInt(param(value), 10);
  if (!Number.isInteger(n) || n <= OVERDUE_PAGE_SIZE) return OVERDUE_PAGE_SIZE;
  return Math.min(Math.ceil(n / OVERDUE_PAGE_SIZE) * OVERDUE_PAGE_SIZE, OVERDUE_MAX_ROWS);
}

const byOverdue = (a: OverdueRow, b: OverdueRow) => b.overduePaise - a.overduePaise || a.name.localeCompare(b.name);
const offLast = (a: OverdueRow, b: OverdueRow) => Number(!a.active) - Number(!b.active);

/** Switched-on shops first (biggest overdue first, then name), then switched-off ones in the same order. */
export function sortOverdue(rows: readonly OverdueRow[]): OverdueRow[] {
  return [...rows].sort((a, b) => offLast(a, b) || byOverdue(a, b));
}

/**
 * The overdue list: shops with something overdue for at least `minDays` past terms (0 = any), and
 * only `repId`'s shops when given. Switched-off shops are never dropped for being off. Sorted.
 */
export function filterOverdue(rows: readonly OverdueRow[], f: { minDays: MinDays; repId?: string | null }): OverdueRow[] {
  return sortOverdue(
    rows.filter(
      (r) => r.overduePaise > 0 && r.daysPastTerms >= f.minDays && (!f.repId || r.salesRepId === f.repId),
    ),
  );
}

/** "₹18,40,000 overdue · 23 shops". */
export function overdueSummary(rows: readonly OverdueRow[]): { overduePaise: number; shops: number } {
  return { overduePaise: rows.reduce((n, r) => n + r.overduePaise, 0), shops: rows.length };
}

/**
 * Who to collect from today: `repId`'s shops (all when undefined) that owe. Overdue shops first
 * (biggest overdue first), then the rest by dues; switched-off shops last. At most `limit`.
 */
export function collectToday(rows: readonly OverdueRow[], repId: string | undefined, limit = 10): OverdueRow[] {
  const group = (r: OverdueRow) => (r.overduePaise > 0 ? 0 : 1);
  return rows
    .filter((r) => r.duePaise > 0 && (repId === undefined || r.salesRepId === repId))
    .sort(
      (a, b) =>
        offLast(a, b) ||
        group(a) - group(b) ||
        b.overduePaise - a.overduePaise ||
        b.duePaise - a.duePaise ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}

/**
 * Whose shops a person may see on the overdue list. Admin and accounts: everyone's, with a "Mine"
 * toggle. Sales (without admin or accounts): only their own, whatever the address says. Others: null.
 */
export function shopScope(
  role: string | null | undefined,
  userId: string,
): { repId: string | null; canPickAll: boolean } | null {
  if (isAdmin(role) || hasRole(role, "accounts")) return { repId: null, canPickAll: true };
  if (hasRole(role, "sales")) return { repId: userId, canPickAll: false };
  return null;
}

/** The empty-list words: "No overdue shops", or "Nothing over 60 days" with a days filter. */
export function overdueEmptyTitle(minDays: MinDays): string {
  return minDays ? `Nothing over ${minDays} days` : "No overdue shops";
}

export type Tone = "muted" | "caution" | "risk";

/** Whole days the stock lasts at the average daily dispatch of the last `windowDays`. Null with no dispatches. */
export function daysOfCover(stockBags: number, dispatchedBags: number, windowDays = 14): number | null {
  if (dispatchedBags <= 0 || windowDays <= 0) return null;
  if (stockBags <= 0) return 0;
  return Math.floor((stockBags * windowDays) / dispatchedBags);
}

/** Under 1 day = risk, under 3 = caution. */
export function coverTone(days: number | null): Tone {
  if (days === null) return "muted";
  if (days < 1) return "risk";
  if (days < 3) return "caution";
  return "muted";
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "Oldest 40 min", "Oldest 3 h", "Oldest 2 days". */
export function ageText(from: Date, now: Date): string {
  const ms = Math.max(0, now.getTime() - from.getTime());
  if (ms < HOUR) return `Oldest ${Math.max(1, Math.floor(ms / MINUTE))} min`;
  if (ms < DAY) return `Oldest ${Math.floor(ms / HOUR)} h`;
  return `Oldest ${daysText(Math.floor(ms / DAY))}`;
}

/** Older than one day = risk. */
export function ageTone(from: Date, now: Date): Tone {
  return now.getTime() - from.getTime() > DAY ? "risk" : "muted";
}

/** 00:00 IST on the 1st of the month (India) that `now` falls in. */
export function monthStartIST(now: Date): Date {
  return istStartOf(`${toISTDateKey(now).slice(0, 7)}-01`);
}
