import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";
import { emptyBuckets, type DuesAging } from "./due-items";
import { cashRows, csvFilename, duesRows, salesRows, statementRows, supplierRows } from "./report-csv";
import type { SalesReport } from "./sales-report";
import { buildStatement } from "./statement-rules";

describe("csvFilename", () => {
  it("is ASCII with the dates", () => {
    expect(csvFilename("sales", "2026-04-01", "2026-04-30")).toBe("sales_2026-04-01_2026-04-30.csv");
    expect(csvFilename("Ré port/x", "2026-04-01", "2026-04-30")).toBe("r-port-x_2026-04-01_2026-04-30.csv");
  });
});

describe("salesRows", () => {
  const line = { key: "2026-04-02", label: "x", bags: 10, valuePaise: 350_005, loads: 1 };
  const r: SalesReport = {
    loads: 1,
    bags: 10,
    valuePaise: 350_005,
    byProduct: [{ ...line, label: "Prism OPC" }],
    byRetailer: [{ ...line, label: "=Evil" }],
    bySalesPerson: [{ ...line, label: "Ravi" }],
    byDay: [line],
  };
  it("has a title and header row per table, money in rupees and day keys", () => {
    const rows = salesRows(r);
    expect(rows[0]).toEqual(["Sales"]);
    expect(rows).toContainEqual(["Product", "Bags", "Value (₹)"]);
    expect(rows).toContainEqual(["Prism OPC", 10, "3500.05"]);
    expect(rows).toContainEqual(["2026-04-02", 10, "3500.05"]);
    expect(rows.filter((x) => x.length === 0)).toHaveLength(4);
    expect(toCsv(rows)).toContain("'=Evil");
  });
});

describe("duesRows", () => {
  it("lists dues, total and advances", () => {
    const b = { ...emptyBuckets(), d0_30: 5000 };
    const d: DuesAging = {
      lines: [{ retailerId: "r1", name: "Sharma", duePaise: 5000, buckets: b }],
      total: { duePaise: 5000, buckets: b },
      advances: [{ retailerId: "r2", name: "Gupta", advancePaise: 700 }],
      advancesPaise: 700,
    };
    const rows = duesRows(d, "2026-04-30");
    expect(rows[1]).toEqual(["Retailer", "Due (₹)", "0–30 days (₹)", "31–60 days (₹)", "61–90 days (₹)", "90+ days (₹)"]);
    expect(rows[2]).toEqual(["Sharma", "50.00", "50.00", "0.00", "0.00", "0.00"]);
    expect(rows).toContainEqual(["Gupta", "7.00"]);
  });
});

describe("statementRows", () => {
  it("writes opening, entries with a negative payment, and closing", () => {
    const s = buildStatement(
      [
        { amountPaise: 10_000, kind: "order_debit", note: "", createdAt: new Date("2026-04-02T20:00:00Z") },
        { amountPaise: -2_500, kind: "receipt_credit", note: "cash, part", createdAt: new Date("2026-04-03T05:00:00Z") },
      ],
      () => "in",
    );
    const rows = statementRows("Sharma", "2026-04-01", "2026-04-30", s);
    expect(rows).toContainEqual(["2026-04-03", "Dispatch", "", "100.00", "100.00"]);
    expect(rows).toContainEqual(["2026-04-03", "Payment", "cash, part", "-25.00", "75.00"]);
    expect(rows).toContainEqual(["", "Closing", "", "", "75.00"]);
  });
});

describe("supplierRows", () => {
  it("shows the payment mode and the reference", () => {
    const s = buildStatement(
      [{ amountPaise: -9_900, kind: "payment", entryDate: "2026-04-05", mode: "bank", reference: "UTR1", note: "n" }],
      () => "in",
    );
    const rows = supplierRows("Prism", "2026-04-01", "2026-04-30", s);
    expect(rows).toContainEqual(["2026-04-05", "Payment", "Bank", "UTR1", "n", "-99.00", "-99.00"]);
  });
});

describe("cashRows", () => {
  it("has counts as numbers and money in rupees", () => {
    const c = { count: 2, paise: 1_000 };
    const z = { count: 0, paise: 0 };
    const rows = cashRows(
      {
        holders: [{ name: "Ravi", heldPaise: 500, waitingPaise: 0 }],
        heldPaise: 500,
        byMode: { cash: c, onlineVerified: z, onlineWaiting: z, total: c, reversed: z, rejected: z },
      } as never,
      "2026-04-01",
      "2026-04-30",
    );
    expect(rows).toContainEqual(["Cash", 2, "10.00"]);
    expect(rows).toContainEqual(["Ravi", "5.00", "0.00"]);
  });
});
