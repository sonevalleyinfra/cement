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
 * - A sales person who is not admin gets Mine / All and status groups instead of these tabs (hasScopeTabs);
 *   "Rate to fill" stays for them only as the focused list Home opens.
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

/** `?done=1`: the Done group is open. */
export function parseDone(raw: unknown): boolean {
  return first(raw) === "1";
}

/* ---------- Mine / All and the status groups (a sales person who is not admin) ---------- */

/** Sales people choose between their own orders and shops and everyone's. Every other role keeps the tabs. */
export function hasScopeTabs(role: string | null | undefined): boolean {
  return hasRole(role, "sales") && !isAdmin(role);
}

export type OrderScope = "mine" | "all";

/** Mine or All from `?scope=`: Mine unless "all". Other roles have no scope: always "all", and callers ignore it. */
export function parseOrderScope(raw: unknown, role: string | null | undefined): OrderScope {
  if (!hasScopeTabs(role)) return "all";
  return first(raw) === "all" ? "all" : "mine";
}

/** The Retailers list's `?scope=` follows the same rule as the orders list. */
export const parseRetailerScope = parseOrderScope;

/** "/retailers", or "/retailers?scope=all". */
export function buildRetailersHref(scope: OrderScope): string {
  return scope === "all" ? "/retailers?scope=all" : "/retailers";
}

export const OPEN_ORDER_STATUSES = ["placed", "approved", "partly_dispatched"] as const satisfies readonly OrderStatus[];
export const DONE_ORDER_STATUSES = ["dispatched", "rejected", "cancelled"] as const satisfies readonly OrderStatus[];
/** Most open orders the grouped list loads at once. */
export const OPEN_ORDER_LIMIT = 300;

export const ORDER_GROUPS = ["rate", "approve", "send", "partly", "done"] as const;
export type OrderGroup = (typeof ORDER_GROUPS)[number];

/** The group an order sits in. A status the app does not know counts as finished. */
export function orderGroupOf(status: string, ratePaise: number | null): OrderGroup {
  switch (status) {
    case "placed":
      return ratePaise === null ? "rate" : "approve";
    case "approved":
      return "send";
    case "partly_dispatched":
      return "partly";
    default:
      return "done";
  }
}

/** In All the missing rate is usually someone else's to fill, so it does not say "to fill". */
export function orderGroupLabel(group: OrderGroup, scope: OrderScope): string {
  switch (group) {
    case "rate":
      return scope === "mine" ? "Rate to fill" : "No rate yet";
    case "approve":
      return "To approve";
    case "send":
      return "To send";
    case "partly":
      return "Partly sent";
    case "done":
      return "Done";
  }
}

/** Orders by group, in ORDER_GROUPS order (Done last), keeping their order inside a group. Empty groups are left out. */
export function groupOrders<T extends { status: string; ratePaise: number | null }>(
  rows: readonly T[],
  scope: OrderScope,
): { group: OrderGroup; label: string; rows: T[] }[] {
  return ORDER_GROUPS.map((group) => ({
    group,
    label: orderGroupLabel(group, scope),
    rows: rows.filter((r) => orderGroupOf(r.status, r.ratePaise) === group),
  })).filter((g) => g.rows.length > 0);
}

/* ---------- The list's address ---------- */

export type OrdersListState = {
  /** The tab, "" for this person's default. For a sales person only "rate" (the focused list). */
  show: string;
  /** Set only for people with Mine / All. */
  scope?: OrderScope;
  q: string;
  done: boolean;
  n: number;
};

/**
 * The list's state from address values, each one checked. Used for the list itself and for the way back
 * from an order, so both agree. For a sales person, the focused "Rate to fill" list has no scope, search or
 * Done, a search always shows Done, and pages only count while Done is showing.
 */
export function parseOrdersListState(raw: Record<string, unknown>, role: string | null | undefined): OrdersListState {
  // Search is for staff; a shop's own login sees few orders.
  const q = isStaff(role) ? parseOrderSearch(raw.q) : "";
  const n = parsePages(raw.n);
  if (!hasScopeTabs(role)) return { show: orderFilterValue(parseOrderFilter(raw.show, role), role), q, done: false, n };
  if (first(raw.show) === "rate") return { show: "rate", q: "", done: false, n };
  const done = !q && parseDone(raw.done);
  return { show: "", scope: parseOrderScope(raw.scope, role), q, done, n: q || done ? n : 1 };
}

function ordersListQuery({ show, scope, q, done, n }: Partial<OrdersListState>): string {
  const params = new URLSearchParams();
  if (show) params.set("show", show);
  if (scope === "all") params.set("scope", "all");
  if (q) params.set("q", q);
  if (done) params.set("done", "1");
  if (n && n > 1) params.set("n", String(n));
  return params.toString();
}

/** "/orders" with the list's state; empty or default parts are left out. */
export function buildOrdersHref(state: Partial<OrdersListState>): string {
  const query = ordersListQuery(state);
  return query ? `/orders?${query}` : "/orders";
}

/** An order's page, remembering the list it was opened from. */
export function orderDetailHref(id: string, state: Partial<OrdersListState>): string {
  const query = ordersListQuery(state);
  return query ? `/orders/${id}?from=${encodeURIComponent(query)}` : `/orders/${id}`;
}

/**
 * The way back from an order, from its `?from=`. Rebuilt from the parsed values and never the text itself,
 * so a made-up `from` can only ever lead to the orders list.
 */
export function orderBackHref(from: unknown, role: string | null | undefined): string {
  const value = first(from);
  if (typeof value !== "string") return "/orders";
  return buildOrdersHref(parseOrdersListState(Object.fromEntries(new URLSearchParams(value)), role));
}
