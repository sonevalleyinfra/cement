/**
 * Books check (ADR 0001, decision 2): the invariant checks and how their results become
 * pass/fail lines. Plain functions, no database. The queries live in lib/books-check-queries.ts.
 *
 * Numbering follows the ADR table: I11 = every movement/money row has an actor,
 * I12 = every movement/money row has its activity-log row. I10 (balances are sums) and
 * I13 (append-only, enforced by triggers) need no check.
 */
import { formatINR } from "./money";
import { bagsText, formatCount } from "./words";

export const CHECKS = [
  { id: "I1", title: "Stock never below 0", meaning: "Each product at each place, over time" },
  { id: "I2", title: "Order bags and status", meaning: "Sent bags ≤ ordered; status matches what went out" },
  { id: "I3", title: "Order billing", meaning: "Order debits = dispatched bags × rate" },
  { id: "I4", title: "Order stock out", meaning: "Stock taken out = dispatched bags" },
  { id: "I5", title: "Stock moves", meaning: "Moves between places net to 0" },
  { id: "I6", title: "Purchases", meaning: "One supplier entry per purchase = bags × cost" },
  { id: "I7", title: "Payments in the ledger", meaning: "Credit only for received or verified payments" },
  { id: "I8", title: "Cash payments", meaning: "Cash in the recorder's wallet = payment total" },
  { id: "I9", title: "Cash held", meaning: "Held and available ≥ 0; handovers answered once, never more than asked; none with a switched-off person" },
  { id: "I11", title: "Who did it", meaning: "Every movement and money row has a person" },
  { id: "I12", title: "Activity log", meaning: "Every movement and money row has its log row" },
] as const;

export type CheckId = (typeof CHECKS)[number]["id"];

/** Most offending rows shown under one check. */
export const ROW_CAP = 20;

/** What an offending row points at. */
export type RowKind = "order" | "receipt" | "retailer" | "supplier" | "staff" | "stock" | "none";

/**
 * One offending row as a query returns it. `got` / `want` are bags or paise (see `unit`);
 * Postgres sums arrive as strings, so numbers are taken loosely and read with `Number`.
 */
export type BooksRow = {
  kind: string;
  ref: string | null;
  what: string;
  unit: string | null;
  got: number | string | null;
  want: number | string | null;
};

export type CheckResult = { id: CheckId; total: number; rows: BooksRow[] } | { id: CheckId; error: true };

/** `text` is the whole row; `title` / `detail` are its two parts for a two-line row. */
export type ShownRow = { href: string | null; text: string; title: string; detail: string };

export type BooksLine = {
  id: CheckId;
  title: string;
  meaning: string;
  ok: boolean;
  error: boolean;
  problems: number;
  label: string;
  rows: ShownRow[];
  /** Offending rows not shown (over the cap). */
  more: number;
};

/** "✓" when nothing is wrong, else "1 problem" / "N problems". */
export function problemsLabel(n: number): string {
  if (n === 0) return "✓";
  return `${formatCount(n)} ${n === 1 ? "problem" : "problems"}`;
}

/** Where an offending row links to, or null when there is no page for it. */
export function rowHref(kind: string, ref: string | null): string | null {
  if (kind === "stock") return "/reports/stock";
  if (kind === "staff") return "/reports/staff";
  if (!ref) return null;
  const id = encodeURIComponent(ref);
  switch (kind) {
    case "order":
      return `/orders/${id}`;
    case "receipt":
      return `/receipts/${id}`;
    case "retailer":
      return `/ledger/${id}`;
    case "supplier":
      return `/suppliers/${id}`;
    default:
      return null;
  }
}

const amount = (unit: string | null, v: number) => (unit === "paise" ? formatINR(v) : unit === "bags" ? bagsText(v) : formatCount(v));

/** "Order · Shah Traders · 120 bags · expected 100 bags". */
export function describeRow(row: BooksRow): string {
  return [row.what, rowDetail(row)].filter(Boolean).join(" · ");
}

/** The numbers part of a row: "120 bags · expected 100 bags", or "" when there are none. */
export function rowDetail(row: BooksRow): string {
  const parts: string[] = [];
  if (row.got != null) parts.push(amount(row.unit, Number(row.got)));
  if (row.want != null) parts.push(`expected ${amount(row.unit, Number(row.want))}`);
  return parts.join(" · ");
}

/** One line per check, in the ADR order. A check that could not run is never ✓. */
export function summarize(results: readonly CheckResult[]): BooksLine[] {
  const byId = new Map(results.map((r) => [r.id, r]));
  return CHECKS.map((c) => {
    const r = byId.get(c.id);
    if (!r || "error" in r) {
      return { ...c, ok: false, error: true, problems: 0, label: "Could not run", rows: [], more: 0 };
    }
    const problems = Math.max(r.total, r.rows.length);
    const rows = r.rows.slice(0, ROW_CAP).map((row) => ({ href: rowHref(row.kind, row.ref), text: describeRow(row), title: row.what, detail: rowDetail(row) }));
    return { ...c, ok: problems === 0, error: false, problems, label: problemsLabel(problems), rows, more: problems - rows.length };
  });
}

/**
 * I12 cutoff: rows older than the first activity-log row are skipped (they were written before
 * the log existed). Null means "no log yet": I12 reports 0 problems.
 */
export function activityLogCutoff(firstLogAt: Date | string | null | undefined): Date | null {
  if (firstLogAt == null) return null;
  const d = firstLogAt instanceof Date ? firstLogAt : new Date(firstLogAt);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** True when a row falls inside the I12 check (written at or after the cutoff). */
export function coveredByActivityLog(createdAt: Date, cutoff: Date | null): boolean {
  return cutoff != null && createdAt.getTime() >= cutoff.getTime();
}
