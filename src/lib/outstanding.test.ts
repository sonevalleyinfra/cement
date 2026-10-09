import { describe, expect, it } from "vitest";
import { outstandingOrders } from "./outstanding";

const o = (orderId: string, billedPaise: number, d = "2026-10-01") => ({
  orderId,
  firmId: "A",
  retailerId: "R",
  dueSinceDate: d,
  billedPaise,
});

describe("outstandingOrders", () => {
  it("subtracts earlier allocations", () => {
    const r = outstandingOrders([o("1", 10000)], [{ orderId: "1", amountPaise: 4000 }]);
    expect(r[0].duePaise).toBe(6000);
  });
  it("drops fully paid and cancelled (zero) orders", () => {
    const r = outstandingOrders([o("1", 5000), o("2", 0)], [{ orderId: "1", amountPaise: 5000 }]);
    expect(r).toEqual([]);
  });
  it("ignores advance rows with no order", () => {
    const r = outstandingOrders([o("1", 5000)], [{ orderId: null, amountPaise: 9000 }]);
    expect(r[0].duePaise).toBe(5000);
  });
  it("sums several allocations on one order", () => {
    const r = outstandingOrders([o("1", 5000)], [
      { orderId: "1", amountPaise: 1000 },
      { orderId: "1", amountPaise: 1500 },
    ]);
    expect(r[0].duePaise).toBe(2500);
  });
});
