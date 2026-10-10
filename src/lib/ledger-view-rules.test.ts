import { describe, expect, it } from "vitest";
import { balanceLine, ledgerEntryLabel, ledgerRowsForViewer, type LedgerSourceRow } from "./ledger-view-rules";

describe("ledgerEntryLabel", () => {
  it("calls a credit (negative) receipt row a payment", () => {
    expect(ledgerEntryLabel("receipt_credit", -50_000)).toBe("Payment");
  });
  it("calls a re-debit (positive) receipt row a reversed payment ", () => {
    expect(ledgerEntryLabel("receipt_credit", 50_000)).toBe("Payment reversed");
  });
  it("labels the other kinds by kind, whatever the sign", () => {
    expect(ledgerEntryLabel("opening", 10_000)).toBe("Opening balance");
    expect(ledgerEntryLabel("opening", -10_000)).toBe("Opening balance");
    expect(ledgerEntryLabel("order_debit", 10_000)).toBe("Dispatch");
    expect(ledgerEntryLabel("adjustment", -10_000)).toBe("Adjustment");
  });
  it("falls back to the raw kind for an unknown kind", () => {
    expect(ledgerEntryLabel("something_new", 1)).toBe("something_new");
  });
});

describe("balanceLine", () => {
  it("a minus balance is an advance, shown as a plus amount", () => {
    expect(balanceLine(-123_450)).toEqual({ label: "Advance", amountPaise: 123_450 });
  });
  it("a plus or zero balance is dues", () => {
    expect(balanceLine(50_000)).toEqual({ label: "Dues", amountPaise: 50_000 });
    expect(balanceLine(0)).toEqual({ label: "Dues", amountPaise: 0 });
  });
});

describe("ledgerRowsForViewer", () => {
  const at = new Date("2026-10-01T06:00:00Z");
  const base = { note: "", actorId: "u1", createdAt: at, product: null, bags: null };
  const rows: LedgerSourceRow[] = [
    { ...base, id: "o", kind: "opening", amountPaise: 100_000, balancePaise: 100_000 },
    { ...base, id: "d", kind: "order_debit", amountPaise: 1_420_000, balancePaise: 1_520_000, note: "40 bags in BR01AB1234", product: "Prism Trade OPC 53", bags: 40 },
    { ...base, id: "p", kind: "receipt_credit", amountPaise: -500_000, balancePaise: 1_020_000, note: "Payment #3" },
    { ...base, id: "r", kind: "receipt_credit", amountPaise: 500_000, balancePaise: 1_520_000 },
    { ...base, id: "a", kind: "adjustment", amountPaise: -20_000, balancePaise: 1_500_000, note: "Rate difference" },
  ];

  it("staff see every amount, balance, note and who posted it", () => {
    for (const role of ["admin", "accounts", "sales", "logistics"]) {
      expect(ledgerRowsForViewer(role, rows).every((r) => r.balancePaise !== null)).toBe(true);
    }
    const v = ledgerRowsForViewer("accounts", rows);
    expect(v.map((r) => [r.amountPaise, r.balancePaise])).toEqual(rows.map((r) => [r.amountPaise, r.balancePaise]));
    expect(v[1]).toMatchObject({ label: "Dispatch", what: "Prism Trade OPC 53 · 40 bags", note: "40 bags in BR01AB1234", actorId: "u1" });
  });

  it("a retailer sees what came (product, bags) but no dispatch amount and no running balance", () => {
    for (const role of ["retailer", null, "user"]) {
      const v = ledgerRowsForViewer(role, rows);
      expect(v[1]).toEqual({
        id: "d",
        label: "Dispatch",
        createdAt: at,
        amountPaise: null,
        balancePaise: null,
        what: "Prism Trade OPC 53 · 40 bags",
        note: null,
        actorId: null,
      });
      for (const r of v) expect(r.balancePaise).toBeNull();
      // No amount anywhere except their own payments (and a payment put back).
      expect(v.filter((r) => r.amountPaise !== null).map((r) => r.id)).toEqual(["p", "r"]);
      expect(JSON.stringify(v)).not.toMatch(/1420000|1520000|Rate difference|BR01/);
    }
  });
});
