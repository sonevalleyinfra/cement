/**
 * "Compared with the period before" for report totals, as plain functions (no database).
 *
 * - The previous period has the same number of days and ends the day before `from`.
 * - Change is whole-percent of the previous value, rounded half away from zero with integer maths.
 *   With a previous value of 0 there is no percent (`pct` is null): the screen shows "new" or "–".
 */
import { mulDivRound } from "./money";
import { addDays, daysBetween, rangeOf, type ReportRange } from "./report-range";

/** The same number of days straight before `range.from`. */
export function previousRange(range: Pick<ReportRange, "from" | "to">): ReportRange {
  const days = daysBetween(range.from, range.to) + 1;
  return rangeOf(addDays(range.from, -days), addDays(range.from, -1));
}

/** current − previous, and that as a whole percent of |previous| (null when previous is 0). */
export function compareDelta(current: number, previous: number): { delta: number; pct: number | null } {
  const delta = current - previous;
  if (!Number.isSafeInteger(delta)) throw new TypeError("Compare needs whole numbers");
  return { delta, pct: previous === 0 ? null : mulDivRound(delta, 100, Math.abs(previous)) };
}

/** "+12%", "−5%", "0%"; "new" when there was nothing before; "–" when both are 0. */
export function deltaLabel(current: number, previous: number): { text: string; tone: "up" | "down" | "flat" } {
  const { delta, pct } = compareDelta(current, previous);
  if (pct === null) return current === 0 ? { text: "–", tone: "flat" } : { text: "new", tone: current > 0 ? "up" : "down" };
  if (pct > 0) return { text: `+${pct}%`, tone: "up" };
  if (pct < 0) return { text: `−${-pct}%`, tone: "down" };
  // Under half a percent rounds to 0%, but a real change still gets its direction colour.
  return { text: "0%", tone: delta > 0 ? "up" : delta < 0 ? "down" : "flat" };
}
