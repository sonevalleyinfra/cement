/**
 * The order list's filter tabs, as plain functions (no database, no request).
 * The picked tab is the `show` value in the address (`/orders?show=rate`), so Home cards can link to it.
 *
 * Choices where the spec is silent (kept short, one tab per job):
 * - The default tab (no `show` in the address) is the person's own job: sales "Rate to fill",
 *   accounts "To approve", logistics "To send", a shop "Open", admin "All".
 * - Staff get a tab for each job they hold: sales "Rate to fill", accounts "To approve",
 *   logistics "To send" (admin holds every job), then "Open" and "All".
 * - Anyone else (a shop's own login) gets "Open", "Done" and "All". Nothing in a tab shows a price.
 * - "Rate to fill" for a sales person is only their own shops' orders, the same number Home shows.
 *   Admin sees every shop's.
 */
import type { OrderStatus } from "./order-rules";
import { isStaff } from "./permissions";
import { hasAnyRole, hasRole, isAdmin } from "./roles";

export const ORDER_FILTERS = ["rate", "approve", "send", "open", "done", "all"] as const;
export type OrderFilter = (typeof ORDER_FILTERS)[number];

export const ORDER_FILTER_LABELS: Record<OrderFilter, string> = {
  rate: "Rate to fill",
  approve: "To approve",
  send: "To send",
  open: "Open",
  done: "Done",
  all: "All",
};

/** What the list says when a tab has no orders. */
export const ORDER_FILTER_EMPTY: Record<OrderFilter, string> = {
  rate: "No rates to fill",
  approve: "Nothing to approve",
  send: "Nothing to send",
  open: "No open orders",
  done: "No finished orders",
  all: "No orders",
};

/** The tabs this person sees, in order. */
export function orderFilterTabs(role: string | null | undefined): OrderFilter[] {
  if (!isStaff(role)) return ["open", "done", "all"];
  const tabs: OrderFilter[] = [];
  if (hasAnyRole(role, ["sales"])) tabs.push("rate");
  if (hasAnyRole(role, ["accounts"])) tabs.push("approve");
  if (hasAnyRole(role, ["logistics"])) tabs.push("send");
  return [...tabs, "open", "all"];
}

/** The tab shown when the address has none: the person's own job, admin and anyone unknown "All". */
export function defaultOrderFilter(role: string | null | undefined): OrderFilter {
  const tabs = orderFilterTabs(role);
  return (tabs as string[]).includes("all") ? "all" : (tabs[0] ?? "all");
}

/** The picked tab from the address: a tab this person has, else their default tab. */
export function parseOrderFilter(raw: unknown, role: string | null | undefined): OrderFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const tabs = orderFilterTabs(role);
  return typeof value === "string" && (tabs as string[]).includes(value) ? (value as OrderFilter) : defaultOrderFilter(role);
}

export type OrderFilterSpec = {
  /** Only these statuses (null = any). */
  statuses: OrderStatus[] | null;
  /** "missing" = placed with no rate yet, "filled" = placed with a rate (waiting for accounts). */
  rate: "missing" | "filled" | null;
};

export function orderFilterSpec(filter: OrderFilter): OrderFilterSpec {
  switch (filter) {
    case "rate":
      return { statuses: ["placed"], rate: "missing" };
    case "approve":
      return { statuses: ["placed"], rate: "filled" };
    case "send":
      return { statuses: ["approved", "partly_dispatched"], rate: null };
    case "open":
      return { statuses: ["placed", "approved", "partly_dispatched"], rate: null };
    case "done":
      return { statuses: ["dispatched", "rejected", "cancelled"], rate: null };
    case "all":
      return { statuses: null, rate: null };
  }
}

/** "Rate to fill" counts only a sales person's own shops (Home shows the same number); admin sees all. */
export function rateFilterOwnShopsOnly(role: string | null | undefined, filter: OrderFilter): boolean {
  return filter === "rate" && !isAdmin(role) && hasRole(role, "sales");
}

/** The address for a tab: "" for this person's default tab, else "?show=...". */
export function orderFilterValue(filter: OrderFilter, role: string | null | undefined): string {
  return filter === defaultOrderFilter(role) ? "" : filter;
}

/* ---------- Search and "Load more" (staff) ---------- */

/** Orders shown per page; "Load more" adds another page. */
export const ORDER_PAGE_SIZE = 50;
/** Most pages one address may ask for (40 × 50 = 2,000 orders). */
export const MAX_ORDER_PAGES = 40;
const MAX_SEARCH_LENGTH = 60;

const first = (raw: unknown) => (Array.isArray(raw) ? raw[0] : raw);

/** The search box text from `?q=`: trimmed, single spaces, at most 60 characters, "" when none. */
export function parseOrderSearch(raw: unknown): string {
  const value = first(raw);
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_SEARCH_LENGTH).trim();
}

/** The words to search for; every one must match (shop name, place, phone or order number). */
export function orderSearchTerms(q: string): string[] {
  return q.toLowerCase().split(" ").filter(Boolean);
}

/** A word that could be the start of an order number (the first 8 hex characters of its id). */
export function isOrderIdTerm(term: string): boolean {
  return /^[0-9a-f]{1,8}$/i.test(term);
}

/** Makes `%`, `_` and `\` match themselves in a LIKE pattern (Postgres's default escape is `\`). */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** How many pages are loaded, from `?n=`: a whole number 1..40, else 1. */
export function parsePages(raw: unknown): number {
  const value = first(raw);
  if (typeof value !== "string" || !/^\d{1,3}$/.test(value)) return 1;
  const n = Number(value);
  return n >= 1 && n <= MAX_ORDER_PAGES ? n : 1;
}

/** "/orders" with the tab, the search and the pages loaded; empty or default parts are left out. */
export function buildOrdersHref(show: string, q: string, n = 1): string {
  const params = new URLSearchParams();
  if (show) params.set("show", show);
  if (q) params.set("q", q);
  if (n > 1) params.set("n", String(n));
  const query = params.toString();
  return query ? `/orders?${query}` : "/orders";
}
