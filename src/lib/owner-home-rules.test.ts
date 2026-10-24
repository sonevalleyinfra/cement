import { describe, expect, it } from "vitest";
import { cashInHandPaise, hasNoLimit, NO_LIMIT_FILTER, totalDuesPaise } from "./home-rules";
import { buildOverdueRows, type OverdueShop } from "./overdue-rules";
import {
  cashAgeDays,
  cashAgePill,
  cashWithStaff,
  collections,
  deltaPct,
  deltaView,
  dsoDays,
  homeWindows,
  overduePercent,
  perBagDelta,
  stockValue,
  supplierValue,
  windowsText,
  type WalletRow,
} from "./owner-home-rules";
import { profitReport, purchaseCostTotals, type SaleRow } from "./sales-report";
import { paymentsByMode, type PaymentRow } from "./staff-report";

/** 10:00 IST on the given day. */
const at = (key: string) => new Date(`${key}T10:00:00+05:30`);

describe("homeWindows", () => {
  it("compares 1–24 Oct with 1–24 Sep (en-IN writes \"Sept\")", () => {
    const w = homeWindows(at("2026-10-24"));
    expect(w.today).toBe("2026-10-24");
    expect([w.mtd.from, w.mtd.to]).toEqual(["2026-10-01", "2026-10-24"]);
    expect([w.prev.from, w.prev.to]).toEqual(["2026-09-01", "2026-09-24"]);
    expect(windowsText(w)).toBe("1–24 Oct vs 1–24 Sept");
  });
  it("clamps 31 Oct to the 30 days of September", () => {
    const w = homeWindows(at("2026-10-31"));
    expect([w.prev.from, w.prev.to]).toEqual(["2026-09-01", "2026-09-30"]);
  });
  it("1 March compares one day with 1 February", () => {
    const w = homeWindows(at("2026-03-01"));
    expect([w.mtd.from, w.mtd.to]).toEqual(["2026-03-01", "2026-03-01"]);
    expect([w.prev.from, w.prev.to]).toEqual(["2026-02-01", "2026-02-01"]);
    expect(windowsText(w)).toBe("1 Mar vs 1 Feb");
  });
  it("31 March clamps to February (28 days, 29 in a leap year)", () => {
    expect(homeWindows(at("2026-03-31")).prev.to).toBe("2026-02-28");
    expect(homeWindows(at("2028-03-31")).prev.to).toBe("2028-02-29");
  });
  it("January compares with December of the year before", () => {
    const w = homeWindows(at("2027-01-15"));
    expect([w.prev.from, w.prev.to]).toEqual(["2026-12-01", "2026-12-15"]);
  });
  it("uses the India day: 20:00 UTC on 31 Oct is already 1 Nov", () => {
    const w = homeWindows(new Date("2026-10-31T20:00:00Z"));
    expect(w.today).toBe("2026-11-01");
    expect([w.prev.from, w.prev.to]).toEqual(["2026-10-01", "2026-10-01"]);
  });
  it("the DSO window is 90 days including today", () => {
    const w = homeWindows(at("2026-10-24"));
    expect([w.last90.from, w.last90.to]).toEqual(["2026-07-27", "2026-10-24"]);
  });
});

describe("deltas", () => {
  it("whole percent of last month, null with no base", () => {
    expect(deltaPct(112_00, 100_00)).toBe(12);
    expect(deltaPct(96_00, 100_00)).toBe(-4);
    expect(deltaPct(50_00, 0)).toBeNull();
    expect(deltaPct(0, 0)).toBeNull();
  });
  it("Delta shows arrows, '—' under 1% or with no base, and an aria label", () => {
    expect(deltaView(12)).toEqual({ dir: "up", text: "12%", label: "Up 12% on last month" });
    expect(deltaView(-4)).toEqual({ dir: "down", text: "4%", label: "Down 4% on last month" });
    expect(deltaView(0).text).toBe("—");
    expect(deltaView(null)).toEqual({ dir: "none", text: "—", label: "Nothing to compare with last month" });
  });
  it("rupee deltas show the ₹ difference, not a percent", () => {
    expect(deltaView(-120, "rupees")).toEqual({ dir: "down", text: "₹1.20", label: "Down ₹1.20 on last month" });
    expect(deltaView(200, "rupees").text).toBe("₹2");
    expect(deltaView(0, "rupees").dir).toBe("none");
    expect(deltaView(null, "rupees").text).toBe("—");
  });
  it("a new month with nothing yet: ₹0 and '—'", () => {
    expect(deltaView(deltaPct(0, 0))).toMatchObject({ dir: "none", text: "—" });
  });
});

const sale = (over: Partial<SaleRow>): SaleRow => ({
  bags: 10,
  ratePaise: 400_00,
  createdAt: at("2026-10-02"),
  productId: "p1",
  productName: "OPC",
  retailerId: "r1",
  retailerName: "Shop",
  salesRepId: null,
  salesRepName: null,
  ...over,
});

describe("margin per bag", () => {
  it("uses the profit report totals at landed cost; unknown-cost products are left out", () => {
    const purchases = [
      { productId: "p1", bags: 100, unitCostPaise: 380_00 },
      { productId: "p2", bags: 50, unitCostPaise: null },
    ];
    const mtd = profitReport([sale({ bags: 10 }), sale({ productId: "p2", bags: 5 })], purchases).total;
    const prev = profitReport([sale({ bags: 10, ratePaise: 401_20 })], purchases).total;
    expect(mtd.profitPaise).toBe(200_00);
    expect(mtd.profitPerBagPaise).toBe(20_00);
    expect(prev.profitPerBagPaise).toBe(21_20);
    expect(perBagDelta(mtd.profitPerBagPaise, prev.profitPerBagPaise)).toBe(-120);
  });
  it("is null when either month has no bags with a known cost", () => {
    expect(perBagDelta(13_30, null)).toBeNull();
    expect(perBagDelta(null, 13_30)).toBeNull();
    expect(profitReport([], []).total.profitPerBagPaise).toBeNull();
  });
});

describe("overdue % and DSO", () => {
  it("overdue is a whole percent of outstanding, 0 with nothing outstanding", () => {
    expect(overduePercent(22_00, 100_00)).toBe(22);
    expect(overduePercent(1_00, 3_00)).toBe(33);
    expect(overduePercent(0, 0)).toBe(0);
  });
  it("DSO = outstanding × 90 ÷ last 90 days' sales, whole days", () => {
    expect(dsoDays(38_00_000_00, 1_00_00_000_00)).toBe(34);
    expect(dsoDays(0, 50_00)).toBe(0);
  });
  it("DSO is null when there were no sales", () => {
    expect(dsoDays(10_00, 0)).toBeNull();
  });
});

describe("reconciliation: overdue rows vs outstanding", () => {
  const shop = (id: string, creditDays: number | null = null): OverdueShop => ({
    id,
    name: id,
    place: "Town",
    phone: "9876543210",
    creditDays,
    active: true,
    salesRepId: null,
    salesRepName: null,
  });
  const shops = new Map([shop("a"), shop("b", 10), shop("adv")].map((s) => [s.id, s]));
  const ledger = [
    { retailerId: "a", kind: "order_debit", amountPaise: 500_00, orderId: "o1", createdAt: at("2026-08-01") },
    { retailerId: "a", kind: "order_debit", amountPaise: 300_00, orderId: "o2", createdAt: at("2026-10-20") },
    { retailerId: "a", kind: "payment", amountPaise: -200_00, orderId: null, createdAt: at("2026-10-21") },
    { retailerId: "b", kind: "order_debit", amountPaise: 100_00, orderId: "o3", createdAt: at("2026-10-01") },
    // An advance shop: paid more than it owes.
    { retailerId: "adv", kind: "order_debit", amountPaise: 100_00, orderId: "o4", createdAt: at("2026-07-01") },
    { retailerId: "adv", kind: "payment", amountPaise: -250_00, orderId: null, createdAt: at("2026-07-02") },
  ];
  const rows = buildOverdueRows(ledger, shops, new Map(), "2026-10-24");
  const outstanding = totalDuesPaise(ledger);

  it("Σ row dues equals outstanding (an advance shop does not cancel others' dues)", () => {
    expect(outstanding).toBe(700_00);
    expect(rows.reduce((n, r) => n + r.duePaise, 0)).toBe(outstanding);
  });
  it("overdue ≤ outstanding, so the % stays 0..100", () => {
    const overdue = rows.reduce((n, r) => n + r.overduePaise, 0);
    // a: FIFO leaves 300 of the August load (overdue) + 300 of 20 Oct (not yet); b: 100 at 10 days (overdue).
    expect(overdue).toBe(400_00);
    expect(overdue).toBeLessThanOrEqual(outstanding);
    expect(overduePercent(overdue, outstanding)).toBe(57);
  });
});

describe("stockValue", () => {
  it("sums places, values at the average landed cost, counts unknown-cost bags apart", () => {
    const costs = purchaseCostTotals([
      { productId: "p1", bags: 100, unitCostPaise: 380_00 },
      { productId: "p1", bags: 50, unitCostPaise: 395_50 },
      { productId: "p2", bags: 20, unitCostPaise: null },
    ]);
    const v = stockValue(
      [
        { productId: "p1", bags: 30 },
        { productId: "p1", bags: 12 }, // a truck
        { productId: "p2", bags: 7 },
        { productId: "p3", bags: -4 }, // more out than in: counts as 0
      ],
      costs,
    );
    // avg = (100 × 380 + 50 × 395.50) ÷ 150 = 385.1666…; 42 bags → ₹16,177 exactly.
    expect(v).toEqual({ valuePaise: 16_177_00, valuedBags: 42, unvaluedBags: 7 });
  });
  it("is zero with no stock", () => {
    expect(stockValue([], new Map())).toEqual({ valuePaise: 0, valuedBags: 0, unvaluedBags: 0 });
  });
});

describe("collections by mode", () => {
  const pay = (mode: string, status: string, totalPaise: number): PaymentRow => ({
    mode,
    status,
    totalPaise,
    createdAt: at("2026-10-10"),
    receivedBy: "u1",
  });
  it("collected = cash + online verified + waiting; rejected and reversed left out", () => {
    const c = collections(
      paymentsByMode([
        pay("cash", "received", 1000_00),
        pay("online", "verified", 500_00),
        pay("online", "unverified", 200_00),
        pay("online", "rejected", 300_00),
        pay("cash", "reversed", 400_00),
      ]),
    );
    expect(c).toEqual({ totalPaise: 1700_00, cashPaise: 1000_00, onlinePaise: 700_00 });
  });
});

describe("cash with staff", () => {
  const now = at("2026-10-24");
  const row = (collectorId: string, kind: string, amountPaise: number, day: string, extra: Partial<WalletRow> = {}): WalletRow => ({
    collectorId,
    kind,
    amountPaise,
    createdAt: at(day),
    ...extra,
  });

  it("no handovers: age from the oldest collected row", () => {
    expect(cashAgeDays([row("u", "collected", 100_00, "2026-10-21"), row("u", "collected", 50_00, "2026-10-24")], now)).toBe(3);
  });
  it("a partly confirmed handover clears the oldest cash first", () => {
    const rows = [
      row("u", "collected", 100_00, "2026-10-20"),
      row("u", "collected", 100_00, "2026-10-22"),
      row("u", "handover_request", 150_00, "2026-10-23", { id: "h1" }),
      row("u", "handover_confirmed", 120_00, "2026-10-23", { refId: "h1" }),
    ];
    // 120 clears all of 20 Oct (100) and 20 of 22 Oct: 80 left from 22 Oct.
    expect(cashAgeDays(rows, now)).toBe(2);
  });
  it("a reversal clears the oldest cash too", () => {
    const rows = [row("u", "collected", 100_00, "2026-10-18"), row("u", "collected", 40_00, "2026-10-24"), row("u", "reversed", 100_00, "2026-10-24")];
    expect(cashAgeDays(rows, now)).toBe(0);
  });
  it("lists only people holding cash, oldest first then biggest; Σ equals cash in hand", () => {
    const rows = [
      row("ravi", "collected", 840_00, "2026-10-21"),
      row("office", "collected", 120_00, "2026-10-24"),
      row("big", "collected", 900_00, "2026-10-24"),
      row("done", "collected", 50_00, "2026-10-01"),
      row("done", "handover_request", 50_00, "2026-10-02", { id: "h" }),
      row("done", "handover_confirmed", 50_00, "2026-10-02", { refId: "h" }),
      row("rev", "collected", 30_00, "2026-10-05"),
      row("rev", "reversed", 30_00, "2026-10-06"),
      // A request nobody answered yet: the cash is still held.
      row("ravi", "handover_request", 100_00, "2026-10-22", { id: "p" }),
    ];
    const names = new Map([["ravi", "Ravi"], ["office", "Office"], ["big", "Big"]]);
    const list = cashWithStaff(rows, names, now);
    expect(list.map((p) => [p.name, p.heldPaise, p.ageDays])).toEqual([
      ["Ravi", 840_00, 3],
      ["Big", 900_00, 0],
      ["Office", 120_00, 0],
    ]);
    const sum = (kind: string) => rows.filter((r) => r.kind === kind).reduce((n, r) => n + r.amountPaise, 0);
    expect(list.reduce((n, p) => n + p.heldPaise, 0)).toBe(cashInHandPaise(sum("collected"), sum("handover_confirmed"), sum("reversed")));
  });
  it("nobody holding cash = empty list", () => {
    expect(cashWithStaff([], new Map(), now)).toEqual([]);
  });
  it("the age pill: today / N days, risk when older than one day", () => {
    expect(cashAgePill(0)).toEqual({ text: "today", tone: "muted" });
    expect(cashAgePill(1)).toEqual({ text: "1 day", tone: "muted" });
    expect(cashAgePill(3)).toEqual({ text: "3 days", tone: "risk" });
  });
});

describe("shops with no limit", () => {
  it("counts switched-on shops with no credit limit (₹0 is a limit)", () => {
    const shops = [
      { id: "a", active: true, creditLimitPaise: null },
      { id: "b", active: true, creditLimitPaise: 0 },
      { id: "c", active: false, creditLimitPaise: null },
      { id: "d", active: true, creditLimitPaise: 50_000_00 },
    ];
    expect(shops.filter(hasNoLimit).map((s) => s.id)).toEqual(["a"]);
    expect(NO_LIMIT_FILTER).toBe("no-limit");
  });
});

describe("supplierValue", () => {
  it("payable, advance or settled", () => {
    expect(supplierValue({ name: "Prism", balancePaise: 12_40_000_00 })).toBe("₹12,40,000 payable");
    expect(supplierValue({ name: "Prism", balancePaise: -5_000_00 })).toBe("₹5,000 advance");
    expect(supplierValue({ name: "Prism", balancePaise: 0 })).toBe("Settled");
  });
});
