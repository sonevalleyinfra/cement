/**
 * Owner Home (admin, v2 C1 + C2) as plain functions (no database), so every number is easy to test.
 * The database reads live in `owner-home.ts` (server-only, called only from AdminHome).
 * Money is integer paise; divisions use `mulDivRound` (half away from zero). Days are India (IST) days.
 *
 * Formulas:
 * - Windows (`homeWindows`): today = the IST day of `now`. This month (MTD) = day 1 .. today (N = today's
 *   day of the month). Last month = day 1 .. N of the month before, with N clamped to that month's length
 *   (31 Oct compares with 1–30 Sep). The DSO window = the last 90 IST days including today.
 * - Sales ₹ and bags: the Sales report totals for the window (each dispatch = bags × the rate saved on the
 *   dispatch, on the IST day the bags left). Same numbers as Reports → Sales.
 * - Margin: the Profit report totals for the window (`total.profitPaise`, `total.profitPerBagPaise`), which
 *   already use the average LANDED cost per bag (invoice + freight + unloading over received bags).
 *   Products with no known cost are left out, exactly as the Profit report does. Per-bag change =
 *   MTD ₹/bag − last month ₹/bag in paise (null = "—" when either side has no bags with a known cost).
 * - Change % (`Delta`): `compareDelta(current, previous).pct` = round((current − previous) × 100 ÷ |previous|);
 *   no base (previous 0) or under 1% either way shows "—".
 * - Collected: payments recorded in the window by mode (`paymentsByMode`): collected = cash received +
 *   online verified + online waiting; online = verified + waiting. Rejected and reversed payments are
 *   left out. Same numbers as Reports → Cash.
 * - Outstanding: Σ of each shop's positive ledger balance (`totalDuesPaise`), so one shop's advance does
 *   not cancel another's dues. Same as the Dues report total.
 * - Overdue %: round(Σ overduePaise of the overdue rows × 100 ÷ outstanding), whole percent; 0 when
 *   nothing is outstanding. Overdue rows use FIFO (payments clear the oldest items) and each shop's credit
 *   days (30 when not set). Each row's overdue is part of its dues, and Σ row dues = outstanding (tested),
 *   so Overdue ≤ Outstanding and the % is 0..100.
 * - DSO (days sales outstanding, the simple "countback-free" one): round(outstanding × 90 ÷ sales of the
 *   last 90 IST days incl. today), sales = dispatch value as above. Null ("—") when those sales are 0.
 * - Stock value: per product, bags = max(0, Σ bags over every place (godowns and trucks)); value =
 *   round(bags × Σ landed cost ÷ Σ purchased bags) (the average landed cost, as the loss report values
 *   bags). Products with no known cost are left out of ₹ and their bags counted as `unvaluedBags`.
 * - Cash with staff: per person, held = `walletBalance` (collected − reversed − confirmed handovers; a
 *   request still waiting counts as held). Age, FIFO: confirmed handovers and reversals clear the OLDEST
 *   collected rows first; age = whole IST days from the oldest collected row with cash left to today.
 *   Only people holding more than ₹0. Σ held = `cashInHandPaise` of the same rows (tested).
 * - Shops with no limit: switched-on shops whose credit limit is not set (null): `hasNoLimit` in home-rules.
 */
import { formatDayMonth, toISTDateKey } from "./datetime";
import { formatINR, mulDivRound } from "./money";
import { compareDelta } from "./report-compare";
import { addDays, daysBetween, istStartOf, rangeOf, type ReportRange } from "./report-range";
import type { CostTotals } from "./sales-report";
import type { PaymentsByMode } from "./staff-report";
import { supplierBalanceLabel } from "./supplier-rules";
import { walletBalance, type WalletMovement } from "./wallet-rules";
import { daysText } from "./words";

/* ---------- Windows ---------- */

export type HomeWindows = { today: string; mtd: ReportRange; prev: ReportRange; last90: ReportRange };

/** Days in a month (`month` is 1–12). */
function monthLength(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Today, this month so far, the same days last month (clamped) and the last 90 days, as IST day ranges. */
export function homeWindows(now: Date): HomeWindows {
  const today = toISTDateKey(now);
  const [y, m, d] = today.split("-").map(Number);
  const prevYear = m === 1 ? y - 1 : y;
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevStart = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
  const prevDays = Math.min(d, monthLength(prevYear, prevMonth));
  return {
    today,
    mtd: rangeOf(`${today.slice(0, 8)}01`, today),
    prev: rangeOf(prevStart, addDays(prevStart, prevDays - 1)),
    last90: rangeOf(addDays(today, -89), today),
  };
}

/** "1–24 Oct" (or "1 Oct" for a one-day range). */
function rangeText(r: Pick<ReportRange, "from" | "to">): string {
  const end = formatDayMonth(istStartOf(r.to));
  return r.from === r.to ? end : `${Number(r.from.slice(8))}–${end}`;
}

/** The caption's range in words: "1–24 Oct vs 1–24 Sep". */
export function windowsText(w: Pick<HomeWindows, "mtd" | "prev">): string {
  return `${rangeText(w.mtd)} vs ${rangeText(w.prev)}`;
}

/* ---------- Delta ---------- */

/** Change in whole percent of last month, null when there is no base. */
export function deltaPct(current: number, previous: number): number | null {
  return compareDelta(current, previous).pct;
}

/** ₹ per bag this month − last month, in paise; null when either side is unknown. */
export function perBagDelta(current: number | null, previous: number | null): number | null {
  return current === null || previous === null ? null : current - previous;
}

export type DeltaView = { dir: "up" | "down" | "none"; text: string; label: string };

/**
 * What the `Delta` badge shows. `percent`: a whole % (under 1% either way = "—").
 * `rupees`: a paise difference shown as "₹1.20" (0 = "—"). Null = no base = "—".
 */
export function deltaView(value: number | null, unit: "percent" | "rupees" = "percent"): DeltaView {
  const none: DeltaView = { dir: "none", text: "—", label: "No change on last month" };
  if (value === null) return { ...none, label: "Nothing to compare with last month" };
  if (unit === "percent" ? Math.abs(value) < 1 : value === 0) return none;
  const dir = value > 0 ? "up" : "down";
  const text = unit === "percent" ? `${Math.abs(value)}%` : formatINR(Math.abs(value), { hidePaise: true });
  return { dir, text, label: `${dir === "up" ? "Up" : "Down"} ${text} on last month` };
}

/* ---------- Collections ---------- */

export type Collections = { totalPaise: number; cashPaise: number; onlinePaise: number };

/** Collected = cash + online (verified + waiting); rejected and reversed are not in `paymentsByMode` totals. */
export function collections(byMode: PaymentsByMode): Collections {
  return {
    totalPaise: byMode.total.paise,
    cashPaise: byMode.cash.paise,
    onlinePaise: byMode.onlineVerified.paise + byMode.onlineWaiting.paise,
  };
}

/* ---------- Risk ---------- */

/** Overdue as a whole percent of outstanding (0 when nothing is outstanding). */
export function overduePercent(overduePaise: number, outstandingPaise: number): number {
  return outstandingPaise <= 0 ? 0 : mulDivRound(overduePaise, 100, outstandingPaise);
}

export const DSO_DAYS = 90;

/** Days sales outstanding: outstanding × 90 ÷ the last 90 days' sales, whole days; null with no sales. */
export function dsoDays(outstandingPaise: number, sales90Paise: number): number | null {
  return sales90Paise <= 0 ? null : mulDivRound(outstandingPaise, DSO_DAYS, sales90Paise);
}

export type StockValue = { valuePaise: number; valuedBags: number; unvaluedBags: number };

/** Bags on hand (all places) valued at each product's average landed cost; unknown cost = counted apart. */
export function stockValue(
  balances: readonly { productId: string; bags: number }[],
  costs: ReadonlyMap<string, CostTotals>,
): StockValue {
  const bags = new Map<string, number>();
  for (const b of balances) bags.set(b.productId, (bags.get(b.productId) ?? 0) + b.bags);
  const out: StockValue = { valuePaise: 0, valuedBags: 0, unvaluedBags: 0 };
  for (const [productId, total] of bags) {
    const onHand = Math.max(0, total);
    if (onHand === 0) continue;
    const t = costs.get(productId);
    if (!t || t.bags <= 0) {
      out.unvaluedBags += onHand;
      continue;
    }
    out.valuePaise += mulDivRound(onHand, t.costPaise, t.bags);
    out.valuedBags += onHand;
  }
  return out;
}

/* ---------- Cash with staff ---------- */

export type WalletRow = WalletMovement & { collectorId: string; createdAt: Date | string };

export type StaffCash = { personId: string; name: string; heldPaise: number; ageDays: number };

/** Whole IST days since the oldest collected cash that is still held (FIFO), 0 when none. */
export function cashAgeDays(rows: readonly WalletRow[], now: Date): number {
  const b = walletBalance(rows);
  let cleared = b.handedOverPaise + b.reversedPaise;
  const collected = rows
    .filter((r) => r.kind === "collected")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  for (const r of collected) {
    if (cleared >= r.amountPaise) {
      cleared -= r.amountPaise;
      continue;
    }
    return Math.max(0, daysBetween(toISTDateKey(r.createdAt), toISTDateKey(now)));
  }
  return 0;
}

/** Each person holding cash, oldest cash first, then the biggest amount, then name. */
export function cashWithStaff(rows: readonly WalletRow[], names: ReadonlyMap<string, string>, now: Date): StaffCash[] {
  const by = new Map<string, WalletRow[]>();
  for (const r of rows) {
    const list = by.get(r.collectorId) ?? [];
    list.push(r);
    by.set(r.collectorId, list);
  }
  const out: StaffCash[] = [];
  for (const [personId, list] of by) {
    const held = walletBalance(list).balancePaise;
    if (held <= 0) continue;
    out.push({ personId, name: names.get(personId) ?? "Someone", heldPaise: held, ageDays: cashAgeDays(list, now) });
  }
  return out.sort((a, b) => b.ageDays - a.ageDays || b.heldPaise - a.heldPaise || a.name.localeCompare(b.name));
}

/** The age pill: "today" / "1 day" / "3 days"; risk tone when older than one day. */
export function cashAgePill(days: number): { text: string; tone: "risk" | "muted" } {
  return { text: days === 0 ? "today" : daysText(days), tone: days > 1 ? "risk" : "muted" };
}

/* ---------- Suppliers ---------- */

/** "₹x payable" (we owe the brand), "₹x advance" (it owes us), or "Settled". */
export function supplierValue(row: { name: string; balancePaise: number }): string {
  const { amountPaise } = supplierBalanceLabel(row.name, row.balancePaise);
  if (row.balancePaise === 0) return "Settled";
  return `${formatINR(amountPaise, { hidePaise: true })} ${row.balancePaise > 0 ? "payable" : "advance"}`;
}
