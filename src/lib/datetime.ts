import { LOCALE, TIME_ZONE } from "@/lib/locale";

/**
 * Dates are stored in Postgres as timestamptz (an exact moment in time) and
 * shown to people in India Standard Time. The server itself runs in UTC, so
 * ALWAYS format through these helpers — never `date.toLocaleString()` with no
 * time zone, which would show UTC on the server.
 */

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  dateStyle: "medium",
  timeZone: TIME_ZONE,
});

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: TIME_ZONE,
});

/** → "16 Jan 2026" */
export function formatDate(date: Date | string | number): string {
  return dateFormatter.format(new Date(date));
}

/** → "16 Jan 2026, 1:30 am" */
export function formatDateTime(date: Date | string | number): string {
  return dateTimeFormatter.format(new Date(date));
}

/** The calendar date in India as "YYYY-MM-DD" (handy for daily reports). */
export function toISTDateKey(date: Date | string | number): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}

const dayMonthFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  timeZone: TIME_ZONE,
});

/** → "16 Jan" (short hints where the year is clear). */
export function formatDayMonth(date: Date | string | number): string {
  return dayMonthFormatter.format(new Date(date));
}
