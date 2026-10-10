import { describe, expect, it } from "vitest";
import {
  cashInHandPaise,
  homeSections,
  isOpenOrderStatus,
  logisticsCounts,
  istDayStart,
  retailersWithDues,
  totalDuesPaise,
} from "./home-rules";

describe("homeSections", () => {
  it("gives admin one summary section", () => {
    expect(homeSections("admin")).toEqual(["admin"]);
    expect(homeSections("sales,admin")).toEqual(["admin"]);
  });
  it("gives one section per role in a sensible order", () => {
    expect(homeSections("logistics,sales")).toEqual(["sales", "logistics"]);
    expect(homeSections("retailer,accounts,sales")).toEqual(["sales", "accounts", "retailer"]);
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
    expect(isOpenOrderStatus("partly_dispatched")).toBe(true);
    expect(isOpenOrderStatus("delivered")).toBe(false);
    expect(isOpenOrderStatus("cancelled")).toBe(false);
    expect(isOpenOrderStatus("rejected")).toBe(false);
  });
});

describe("logisticsCounts", () => {
  it("counts ready and partly sent orders, ignores the rest", () => {
    const orders = ["approved", "assigned", "partly_dispatched", "dispatched", "placed", "assigned"].map((status) => ({
      status,
    }));
    expect(logisticsCounts(orders)).toEqual({ ready: 3, partly: 1 });
    expect(logisticsCounts([])).toEqual({ ready: 0, partly: 0 });
  });
});
