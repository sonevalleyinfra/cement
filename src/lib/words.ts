/**
 * Small wording helpers, as plain functions so the grammar is tested.
 */
import { LOCALE } from "./locale";
import { parseRoles } from "./roles";

const countFormatter = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

/** A count with Indian grouping: 8350 → "8,350", 125000 → "1,25,000". */
export function formatCount(n: number): string {
  return countFormatter.format(n);
}

/** "1 bag" / "8,350 bags". */
export function bagsText(n: number): string {
  return `${formatCount(n)} ${n === 1 ? "bag" : "bags"}`;
}

/** "1 day" / "1,200 days". */
export function daysText(n: number): string {
  return `${formatCount(n)} ${n === 1 ? "day" : "days"}`;
}

/** "1 shop" / "12 shops". */
export function shopsText(n: number): string {
  return `${formatCount(n)} ${n === 1 ? "shop" : "shops"}`;
}

/** "is" for one bag, "are" for more: "1 bag is on the way", "50 bags are on the way". */
export function isAre(n: number): "is" | "are" {
  return n === 1 ? "is" : "are";
}

/** A role as shown to people: "Sales", "Accounts", "Admin". */
export function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/** The roles of a stored role string as shown labels, in the stored order: "Sales, Accounts". */
export function roleLabels(stored: string | null | undefined): string[] {
  return parseRoles(stored).map(roleLabel);
}

/**
 * What an empty list says. With no filter it is the plain "Nothing yet"; with a date range or another
 * filter picked it says the filter is why ("Nothing in these dates"), so nobody thinks the app is empty.
 */
export function emptyListTitle(filters: { dates: boolean; other: boolean }): string {
  if (filters.other) return "Nothing for these filters";
  if (filters.dates) return "Nothing in these dates";
  return "Nothing yet";
}
