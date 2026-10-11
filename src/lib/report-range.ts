/**
 * Date ranges for reports and the activity log, as plain functions (no database).
 *
 * People pick calendar days in India ("YYYY-MM-DD"). The database stores exact moments (UTC),
 * so a day range becomes two moments: `start` = 00:00 IST of `from`, and `end` = 00:00 IST of
 * the day AFTER `to` (end is exclusive). A row belongs to the range when start <= createdAt < end.
 *
 * Choices where the spec is silent:
 * - Default range: this month so far (the 1st of the current month in India up to today).
 * - A missing or invalid date falls back to the default; if `from` is after `to` they are swapped.
 */
import { toISTDateKey } from "./datetime";

export type ReportRange = {
  /** First day, "YYYY-MM-DD" (India). */
  from: string;
  /** Last day, "YYYY-MM-DD" (India), included. */
  to: string;
  /** 00:00 IST of `from`. */
  start: Date;
  /** 00:00 IST of the day after `to` (exclusive). */
  end: Date;
};

/** True for a real calendar day written "YYYY-MM-DD" (year 2000 or later). */
export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const real = new Date(Date.UTC(y, mo - 1, d));
  return y >= 2000 && real.getUTCFullYear() === y && real.getUTCMonth() === mo - 1 && real.getUTCDate() === d;
}

/** The day `n` days after `key` (n may be negative). */
export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Whole days from `fromKey` to `toKey` (0 when the same day, negative when `toKey` is earlier). */
export function daysBetween(fromKey: string, toKey: string): number {
  const ms = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(toKey) - ms(fromKey)) / 86_400_000);
}

/** 00:00 IST of the day `key`, as an exact moment. */
export function istStartOf(key: string): Date {
  return new Date(`${key}T00:00:00+05:30`);
}

/** Builds a range from what was typed (or nothing). `now` decides "today" and "this month". */
export function reportRange(input: { from?: unknown; to?: unknown }, now: Date = new Date()): ReportRange {
  const today = toISTDateKey(now);
  let from = isDateKey(input.from) ? input.from : `${today.slice(0, 8)}01`;
  let to = isDateKey(input.to) ? input.to : today;
  if (from > to) [from, to] = [to, from];
  return { from, to, start: istStartOf(from), end: istStartOf(addDays(to, 1)) };
}

/** True when the moment falls inside the range (start included, end excluded). */
export function inRange(at: Date | string, range: Pick<ReportRange, "start" | "end">): boolean {
  const t = new Date(at).getTime();
  return t >= range.start.getTime() && t < range.end.getTime();
}

/** "from=...&to=..." for links that keep the range. */
export function rangeQuery(range: Pick<ReportRange, "from" | "to">): string {
  return `from=${range.from}&to=${range.to}`;
}

/** Reads one search param as a plain string ("" when missing or repeated). */
export function param(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

/**
 * A range where both ends may be left empty (the activity log shows everything by default).
 * Only valid days count; a backwards pair is swapped.
 */
export function optionalRange(input: { from?: unknown; to?: unknown }): {
  from: string;
  to: string;
  start: Date | null;
  end: Date | null;
} {
  let from = isDateKey(input.from) ? input.from : "";
  let to = isDateKey(input.to) ? input.to : "";
  if (from && to && from > to) [from, to] = [to, from];
  return { from, to, start: from ? istStartOf(from) : null, end: to ? istStartOf(addDays(to, 1)) : null };
}

/** A page number from the address bar: whole, 0 or more (bad input = 0, capped at 10,000). */
export function pageParam(value: string | string[] | undefined): number {
  const n = Number.parseInt(param(value), 10);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 10_000) : 0;
}
