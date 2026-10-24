import { describe, expect, it } from "vitest";
import {
  averageCostPerBag,
  landedCostRows,
  profitReport,
  purchaseCostTotals,
  saleValuePaise,
  salesReport,
  schemeCreditsPaise,
  type SaleRow,
} from "./sales-report";

const sale = (over: Partial<SaleRow>): SaleRow => ({
  bags: 10,
  ratePaise: 35_000,
  createdAt: "2026-10-03T06:00:00Z",
  productId: "p1",
  productName: "OPC 43",
  retailerId: "r1",
  retailerName: "Sharma",
  salesRepId: "s1",
  salesRepName: "Ravi",
  ...over,
});

describe("salesReport", () => {
  it("no data", () => {
    expect(salesReport([])).toEqual({
      loads: 0,
      bags: 0,
      valuePaise: 0,
      byProduct: [],
      byRetailer: [],
      bySalesPerson: [],
      byDay: [],
    });
  });

  it("a reversal row (minus bags) is a negative sale on its day, not a load", () => {
    const r = salesReport([sale({ bags: 10, ratePaise: 35_000 }), sale({ bags: -4, ratePaise: 35_000 })]);
    expect([r.loads, r.bags, r.valuePaise]).toEqual([1, 6, 6 * 35_000]);
    expect(r.byProduct.map((l) => [l.loads, l.bags])).toEqual([[1, 6]]);
  });

  it("sales = dispatched bags × the rate on each dispatch, grouped four ways", () => {
    const r = salesReport([
      sale({}),
      sale({ bags: 5, ratePaise: 36_000, retailerId: "r2", retailerName: "Gupta" }),
      sale({ bags: 20, ratePaise: 30_000, productId: "p2", productName: "PPC", salesRepId: null, salesRepName: null }),
    ]);
    expect([r.loads, r.bags, r.valuePaise]).toEqual([3, 35, 350_000 + 180_000 + 600_000]);
    expect(r.byProduct.map((l) => [l.label, l.bags, l.valuePaise])).toEqual([
      ["PPC", 20, 600_000],
      ["OPC 43", 15, 530_000],
    ]);
    expect(r.bySalesPerson.map((l) => [l.label, l.valuePaise])).toEqual([
      ["No sales person", 600_000],
      ["Ravi", 530_000],
    ]);
    for (const group of [r.byProduct, r.byRetailer, r.bySalesPerson, r.byDay]) {
      expect(group.reduce((n, l) => n + l.valuePaise, 0)).toBe(r.valuePaise);
      expect(group.reduce((n, l) => n + l.bags, 0)).toBe(r.bags);
    }
  });

  it("each dispatch counts for the sales person saved on it: a shop moved to someone else keeps its old sales", () => {
    // The same shop: two loads under Ravi, then admin gave the shop to Asha before the third load.
    const r = salesReport([
      sale({ bags: 10 }),
      sale({ bags: 10 }),
      sale({ bags: 5, salesRepId: "s2", salesRepName: "Asha" }),
    ]);
    expect(r.bySalesPerson.map((l) => [l.label, l.bags])).toEqual([
      ["Ravi", 20],
      ["Asha", 5],
    ]);
    expect(r.byRetailer.map((l) => [l.label, l.bags])).toEqual([["Sharma", 25]]);
  });

  it("days are India days: 23:59 IST and 00:00 IST fall on different days", () => {
    const r = salesReport([sale({ createdAt: "2026-10-02T18:29:00Z" }), sale({ createdAt: "2026-10-02T18:30:00Z" })]);
    expect(r.byDay.map((d) => d.key)).toEqual(["2026-10-02", "2026-10-03"]);
  });

  it("refuses fractional values", () => {
    expect(() => saleValuePaise(1.5, 100)).toThrow();
  });
});

describe("average purchase cost", () => {
  it("is weighted by bags and skips purchases with no cost", () => {
    const t = purchaseCostTotals([
      { productId: "p1", bags: 100, unitCostPaise: 28_000 },
      { productId: "p1", bags: 300, unitCostPaise: 30_000 },
      { productId: "p1", bags: 50, unitCostPaise: null },
    ]);
    expect(t.get("p1")).toEqual({ bags: 400, costPaise: 11_800_000 });
    expect(averageCostPerBag(t.get("p1"))).toBe(29_500);
    expect(averageCostPerBag(undefined)).toBeNull();
  });

  it("rounds the average to the paisa", () => {
    const t = purchaseCostTotals([
      { productId: "p", bags: 1, unitCostPaise: 100 },
      { productId: "p", bags: 2, unitCostPaise: 101 },
    ]);
    expect(averageCostPerBag(t.get("p"))).toBe(101); // 302 / 3 = 100.67
  });
});

describe("profitReport", () => {
  const purchases = [
    { productId: "p1", bags: 100, unitCostPaise: 28_000 },
    { productId: "p1", bags: 100, unitCostPaise: 30_000 },
  ];

  it("profit = sales − bags × average cost, per bag and total", () => {
    const r = profitReport([sale({ bags: 10, ratePaise: 35_000 }), sale({ bags: 5, ratePaise: 36_000 })], purchases);
    expect(r.lines).toEqual([
      {
        productId: "p1",
        label: "OPC 43",
        bags: 15,
        salesPaise: 530_000,
        avgCostPaise: 29_000,
        costPaise: 435_000,
        profitPaise: 95_000,
        profitPerBagPaise: 6_333,
      },
    ]);
    expect(r.total).toEqual({ bags: 15, salesPaise: 530_000, costPaise: 435_000, profitPaise: 95_000, profitPerBagPaise: 6_333 });
    expect(r.unknown).toEqual({ products: 0, bags: 0, salesPaise: 0 });
  });

  it("a product with no known cost is shown but left out of the total", () => {
    const r = profitReport([sale({}), sale({ productId: "p2", productName: "PPC", bags: 4 })], purchases);
    const p2 = r.lines.find((l) => l.productId === "p2");
    expect(p2).toMatchObject({ costPaise: null, profitPaise: null, profitPerBagPaise: null });
    expect(r.total.salesPaise).toBe(350_000);
    expect(r.unknown).toEqual({ products: 1, bags: 4, salesPaise: 140_000 });
  });

  it("selling below cost gives a loss", () => {
    const r = profitReport([sale({ bags: 3, ratePaise: 25_000 })], purchases);
    expect(r.total.profitPaise).toBe(75_000 - 87_000);
    expect(r.total.profitPerBagPaise).toBe(-4_000);
  });

  it("no sales: empty, profit per bag unknown", () => {
    const r = profitReport([], purchases);
    expect(r.lines).toEqual([]);
    expect(r.total.profitPerBagPaise).toBeNull();
  });
});

describe("schemeCreditsPaise", () => {
  it("adds up credits only, as a plus amount", () => {
    expect(
      schemeCreditsPaise([
        { kind: "credit", amountPaise: -1_500_000 },
        { kind: "payment", amountPaise: -5_000_000 },
        { kind: "credit", amountPaise: -500 },
      ]),
    ).toBe(1_500_500);
    expect(schemeCreditsPaise([])).toBe(0);
  });
});

describe("landed cost in profit", () => {
  it("weights each purchase by its received bags at the landed cost", () => {
    const rows = landedCostRows([
      // 600 billed, 588 received, landed ₹310.31 a bag.
      { productId: "p1", bags: 600, unitCostPaise: 29_500, receivedBags: 588, landedUnitCostPaise: 31_031 },
      // 100 billed, all received, landed ₹300 a bag.
      { productId: "p1", bags: 100, unitCostPaise: 28_500, receivedBags: 100, landedUnitCostPaise: 30_000 },
    ]);
    expect(rows).toEqual([
      { productId: "p1", bags: 588, unitCostPaise: 31_031 },
      { productId: "p1", bags: 100, unitCostPaise: 30_000 },
    ]);
    // (588 × 31,031 + 100 × 30,000) ÷ 688 = 30,881.15… → 30,881 paise.
    const r = profitReport([sale({ bags: 10, ratePaise: 35_000 })], rows);
    expect(r.lines[0].avgCostPaise).toBe(30_881);
    expect(r.lines[0].costPaise).toBe(308_811);
  });

  it("a purchase reversal is minus bags at the reversed purchase's landed cost; fully reversed = never bought", () => {
    const bought = { productId: "p1", bags: 600, unitCostPaise: 29_500, receivedBags: 588, landedUnitCostPaise: 31_031 };
    const other = { productId: "p1", bags: 100, unitCostPaise: 28_500, receivedBags: 100, landedUnitCostPaise: 30_000 };
    const reversal = (bags: number) => ({ type: "purchase_reversal", productId: "p1", bags: -bags, unitCostPaise: 29_500, receivedBags: 588, landedUnitCostPaise: 31_031 });
    expect(landedCostRows([reversal(88)])).toEqual([{ productId: "p1", bags: -88, unitCostPaise: 31_031, reversal: true }]);
    const full = purchaseCostTotals(landedCostRows([bought, other, reversal(588)]));
    expect(full.get("p1")).toEqual(purchaseCostTotals(landedCostRows([other])).get("p1"));
    const part = purchaseCostTotals(landedCostRows([bought, reversal(88)]));
    expect(part.get("p1")).toEqual({ bags: 500, costPaise: 500 * 31_031 });
    // Net bags 0: the average is unknown, never a division by zero.
    expect(averageCostPerBag(purchaseCostTotals(landedCostRows([bought, reversal(588)])).get("p1"))).toBeNull();
    // A minus row that is not a reversal is still skipped.
    expect(purchaseCostTotals([{ productId: "p1", bags: -5, unitCostPaise: 100 }]).get("p1")).toBeUndefined();
  });

  it("an old purchase with no header keeps movement bags × invoice cost", () => {
    const rows = landedCostRows([
      { productId: "p1", bags: 200, unitCostPaise: 28_000, receivedBags: null, landedUnitCostPaise: null },
      { productId: "p2", bags: 50, unitCostPaise: null, receivedBags: null, landedUnitCostPaise: null },
    ]);
    expect(rows).toEqual([
      { productId: "p1", bags: 200, unitCostPaise: 28_000 },
      { productId: "p2", bags: 50, unitCostPaise: null },
    ]);
    expect(profitReport([sale({ bags: 10 })], rows).lines[0].avgCostPaise).toBe(28_000);
  });
});
