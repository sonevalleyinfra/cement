import { describe, expect, it } from "vitest";
import {
  LAST_PAYMENT_SKIPS,
  shopsWithoutSalesRep,
  truckLoads,
  cashInHandPaise,
  homeSections,
  isOpenOrderStatus,
  logisticsCounts,
  istDayStart,
  retailersWithDues,
  totalDuesPaise,
} from "./home-rules";

describe("homeSections", () => {
  it("gives admin one summary section plus my cash held", () => {
    expect(homeSections("admin")).toEqual(["admin", "cash"]);
    expect(homeSections("sales,admin")).toEqual(["admin", "cash"]);
  });
  it("gives one section per role in a sensible order, then my cash held once", () => {
    expect(homeSections("logistics,sales")).toEqual(["sales", "logistics", "cash"]);
    expect(homeSections("retailer,accounts,sales")).toEqual(["sales", "accounts", "retailer", "cash"]);
    expect(homeSections("accounts")).toEqual(["accounts", "cash"]);
  });
  it("a pure retailer has no cash section", () => {
    expect(homeSections("retailer")).toEqual(["retailer"]);
  });
  it("ignores unknown or missing roles", () => {
    expect(homeSections("user")).toEqual([]);
    expect(homeSections(null)).toEqual([]);
  });
});

describe("istDayStart", () => {
  it("starts the day at midnight India time", () => {
    // 20:00 UTC on 15 Jan is already 16 Jan in India.
    expect(istDayStart(new Date("2026-01-15T20:00:00Z")).toISOString()).toBe("2026-01-15T18:30:00.000Z");
    expect(istDayStart(new Date("2026-01-15T10:00:00Z")).toISOString()).toBe("2026-01-14T18:30:00.000Z");
  });
});

describe("dues totals", () => {
  const rows = [
    { retailerId: "r1", amountPaise: 500_00 },
    { retailerId: "r1", amountPaise: -200_00 },
    { retailerId: "r2", amountPaise: 100_00 },
    { retailerId: "r3", amountPaise: -50_00 },
    { retailerId: "r4", amountPaise: 900_00 },
    { retailerId: "r4", amountPaise: -1000_00 },
  ];
  it("adds positive balances per retailer only (an advance is not negative dues)", () => {
    expect(totalDuesPaise(rows)).toBe(300_00 + 100_00);
  });
  it("counts retailers that owe something", () => {
    expect(retailersWithDues(rows)).toBe(2);
  });
  it("handles no rows", () => {
    expect(totalDuesPaise([])).toBe(0);
    expect(retailersWithDues([])).toBe(0);
  });
});

describe("cash and open orders", () => {
  it("cash in hand is collected minus confirmed", () => {
    expect(cashInHandPaise(1000_00, 400_00)).toBe(600_00);
    expect(cashInHandPaise(1000_00, 400_00, 100_00)).toBe(500_00); // a reversed cash receipt left the wallet
  });
  it("open orders exclude finished ones", () => {
    expect(isOpenOrderStatus("placed")).toBe(true);
    expect(isOpenOrderStatus("approved")).toBe(true);
    expect(isOpenOrderStatus("partly_dispatched")).toBe(true);
    expect(isOpenOrderStatus("dispatched")).toBe(false);
    expect(isOpenOrderStatus("nonsense")).toBe(false);
    expect(isOpenOrderStatus("cancelled")).toBe(false);
    expect(isOpenOrderStatus("rejected")).toBe(false);
  });
});

describe("logisticsCounts", () => {
  it("counts ready and partly sent orders, ignores the rest", () => {
    const orders = ["approved", "approved", "partly_dispatched", "dispatched", "placed", "cancelled"].map((status) => ({
      status,
    }));
    expect(logisticsCounts(orders)).toEqual({ ready: 2, partly: 1 });
    expect(logisticsCounts([])).toEqual({ ready: 0, partly: 0 });
  });
});

describe("truckLoads", () => {
  const row = (kind: string, placeKey: string, placeName: string, productName: string, bags: number) => ({
    kind,
    placeKey,
    placeName,
    productName,
    bags,
  });
  it("lists only trucks holding bags now, by number, with bags per product", () => {
    const loads = truckLoads([
      row("godown", "godown:g", "Main", "Prism Trade OPC 53", 500),
      row("vehicle", "vehicle:2", "BR02CD5678", "Prism Trade OPC 53", 40),
      row("vehicle", "vehicle:1", "BR01AB1234", "Prism Trade OPC 53", 10),
      row("vehicle", "vehicle:1", "BR01AB1234", "Prism Trade PPC 43", 30),
      row("vehicle", "vehicle:3", "BR03EE0001", "Prism Trade OPC 53", 0),
    ]);
    expect(loads).toEqual([
      {
        truck: "BR01AB1234",
        bags: 40,
        products: [
          { name: "Prism Trade PPC 43", bags: 30 },
          { name: "Prism Trade OPC 53", bags: 10 },
        ],
      },
      { truck: "BR02CD5678", bags: 40, products: [{ name: "Prism Trade OPC 53", bags: 40 }] },
    ]);
  });
  it("is empty when no truck holds bags", () => {
    expect(truckLoads([row("godown", "godown:g", "Main", "P", 5)])).toEqual([]);
  });
});

describe("shopsWithoutSalesRep", () => {
  it("counts switched-on shops with nobody", () => {
    expect(
      shopsWithoutSalesRep([
        { active: true, salesRepId: null },
        { active: true, salesRepId: "s1" },
        { active: false, salesRepId: null },
        { active: true, salesRepId: "" },
      ]),
    ).toBe(2);
  });
});

describe("LAST_PAYMENT_SKIPS", () => {
  it("a rejected or reversed payment is never shown as the shop's last payment", () => {
    expect(LAST_PAYMENT_SKIPS).toEqual(["rejected", "reversed"]);
  });
});
