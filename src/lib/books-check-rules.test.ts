import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  activityLogCutoff,
  CHECKS,
  coveredByActivityLog,
  describeRow,
  problemsLabel,
  ROW_CAP,
  rowHref,
  summarize,
  type BooksRow,
  type CheckResult,
} from "./books-check-rules";

const row = (over: Partial<BooksRow> = {}): BooksRow => ({
  kind: "order",
  ref: "o1",
  what: "Order · Shah",
  unit: "bags",
  got: 120,
  want: 100,
  ...over,
});
const passAll = (): CheckResult[] => CHECKS.map((c) => ({ id: c.id, total: 0, rows: [] }));

describe("problemsLabel", () => {
  it("is ✓ for 0, singular for 1, plural for more", () => {
    expect(problemsLabel(0)).toBe("✓");
    expect(problemsLabel(1)).toBe("1 problem");
    expect(problemsLabel(3)).toBe("3 problems");
    expect(problemsLabel(1200)).toBe("1,200 problems");
  });
});

describe("summarize", () => {
  it("has one line per check: I1–I9, I11, I12", () => {
    const lines = summarize(passAll());
    expect(lines.map((l) => l.id)).toEqual(["I1", "I2", "I3", "I4", "I5", "I6", "I7", "I8", "I9", "I11", "I12"]);
    expect(lines.every((l) => l.ok && l.label === "✓")).toBe(true);
  });

  it("marks a check with problems as failed with its count", () => {
    const results = passAll().map((r) => (r.id === "I3" ? { id: r.id, total: 1, rows: [row()] } : r));
    const line = summarize(results).find((l) => l.id === "I3")!;
    expect(line.ok).toBe(false);
    expect(line.problems).toBe(1);
    expect(line.label).toBe("1 problem");
    expect(line.rows).toEqual([
      { href: "/orders/o1", text: "Order · Shah · 120 bags · expected 100 bags", title: "Order · Shah", detail: "120 bags · expected 100 bags" },
    ]);
    expect(line.more).toBe(0);
  });

  it("shows at most 20 rows and says how many more", () => {
    const rows = Array.from({ length: 25 }, (_, i) => row({ ref: `o${i}` }));
    const results = passAll().map((r) => (r.id === "I2" ? { id: r.id, total: 57, rows } : r));
    const line = summarize(results).find((l) => l.id === "I2")!;
    expect(line.rows).toHaveLength(ROW_CAP);
    expect(line.problems).toBe(57);
    expect(line.label).toBe("57 problems");
    expect(line.more).toBe(37);
  });

  it("never counts fewer problems than rows returned", () => {
    const results = passAll().map((r) => (r.id === "I5" ? { id: r.id, total: 0, rows: [row()] } : r));
    expect(summarize(results).find((l) => l.id === "I5")!.ok).toBe(false);
  });

  it("shows a check that failed to run as an error, not ✓", () => {
    const results = passAll().map((r) => (r.id === "I7" ? { id: r.id, error: true as const } : r));
    const line = summarize(results).find((l) => l.id === "I7")!;
    expect(line.ok).toBe(false);
    expect(line.error).toBe(true);
    expect(line.label).toBe("Could not run");
  });

  it("treats a missing result as could not run", () => {
    const line = summarize(passAll().filter((r) => r.id !== "I12")).find((l) => l.id === "I12")!;
    expect(line.ok).toBe(false);
    expect(line.label).toBe("Could not run");
  });
});

describe("describeRow", () => {
  it("formats money from paise, also when Postgres sends strings", () => {
    expect(describeRow(row({ what: "Payment #7", unit: "paise", got: "-150000", want: "-150050" }))).toBe(
      "Payment #7 · −₹1,500.00 · expected −₹1,500.50",
    );
  });
  it("leaves out missing numbers", () => {
    expect(describeRow(row({ what: "Dispatch", unit: "bags", got: 1, want: null }))).toBe("Dispatch · 1 bag");
    expect(describeRow(row({ what: "Order history · placed", unit: null, got: null, want: null }))).toBe("Order history · placed");
  });
});

describe("rowHref", () => {
  it("links each kind to its page", () => {
    expect(rowHref("order", "a")).toBe("/orders/a");
    expect(rowHref("receipt", "b")).toBe("/receipts/b");
    expect(rowHref("retailer", "c")).toBe("/ledger/c");
    expect(rowHref("supplier", "d")).toBe("/suppliers/d");
    expect(rowHref("staff", "u1")).toBe("/reports/staff");
    expect(rowHref("stock", null)).toBe("/reports/stock");
  });
  it("has no link without an id or for unknown kinds", () => {
    expect(rowHref("order", null)).toBeNull();
    expect(rowHref("none", "x")).toBeNull();
  });
});

describe("activity-log cutoff (I12)", () => {
  it("is null when the log is empty, so I12 reports nothing", () => {
    expect(activityLogCutoff(null)).toBeNull();
    expect(activityLogCutoff(undefined)).toBeNull();
    expect(coveredByActivityLog(new Date(), null)).toBe(false);
  });
  it("skips rows older than the first log row", () => {
    const cutoff = activityLogCutoff("2026-10-01T05:00:00.000Z")!;
    expect(coveredByActivityLog(new Date("2026-09-30T23:59:59Z"), cutoff)).toBe(false);
    expect(coveredByActivityLog(new Date("2026-10-01T05:00:00Z"), cutoff)).toBe(true);
    expect(coveredByActivityLog(new Date("2026-10-02T00:00:00Z"), cutoff)).toBe(true);
  });
  it("accepts a Date", () => {
    const d = new Date("2026-10-01T05:00:00Z");
    expect(activityLogCutoff(d)?.getTime()).toBe(d.getTime());
  });
});

describe("no write queries", () => {
  const files = ["src/lib/books-check.ts", "src/app/(app)/reports/books/page.tsx"];
  it.each(files)("%s only reads", (file) => {
    const source = readFileSync(path.resolve(import.meta.dirname, "../..", file), "utf8");
    expect(source).not.toMatch(/\b(insert|update|delete|truncate|alter|drop|set\s+local)\b/i);
  });
});

describe("I7 covers payment reversals of both kinds", () => {
  it("sums every ledger row of a payment by receipt_id, with no filter on the kind", () => {
    const source = readFileSync(path.resolve(import.meta.dirname, "books-check.ts"), "utf8");
    const i7 = source.slice(source.indexOf("I7: sql`"), source.indexOf("I8: sql`"));
    expect(i7).toMatch(/sum\(l\.amount_paise\).*from ledger_entries l where l\.receipt_id = r\.id\)/);
    // receipt_reversal (+) and the older + receipt_credit rows both count: no kind filter here.
    expect(i7).not.toMatch(/l\.kind/);
    expect(CHECKS).toHaveLength(11);
  });
});
