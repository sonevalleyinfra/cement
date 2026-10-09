import { describe, expect, it } from "vitest";
import {
  canCancelOrder,
  canPlaceOrder,
  canSeePrice,
  chipLabel,
  chipStatus,
  isBagsInRange,
  isRetailerOnly,
  orderListScope,
  resolveOrderRetailer,
  validatePlaceOrder,
} from "./order-access";
import { ORDER_STATUSES } from "./order-rules";

describe("price and placing", () => {
  it("retailer-only sees no price", () => {
    expect(isRetailerOnly("retailer")).toBe(true);
    expect(canSeePrice("retailer")).toBe(false);
  });
  it("staff and admin see price", () => {
    expect(canSeePrice("sales")).toBe(true);
    expect(canSeePrice("retailer,sales")).toBe(true);
    expect(canSeePrice("admin")).toBe(true);
    expect(canSeePrice("retailer,admin")).toBe(true);
  });
  it("sales, retailer and admin can place; others cannot", () => {
    expect(canPlaceOrder("sales")).toBe(true);
    expect(canPlaceOrder("retailer")).toBe(true);
    expect(canPlaceOrder("admin")).toBe(true);
    expect(canPlaceOrder("accounts")).toBe(false);
    expect(canPlaceOrder("logistics")).toBe(false);
    expect(canPlaceOrder(null)).toBe(false);
  });
});

describe("validatePlaceOrder", () => {
  const good = { readOnlyMode: false, bags: 10, retailerId: "r", productId: "p" };
  it("accepts a good order", () => expect(validatePlaceOrder(good)).toEqual({ ok: true }));
  it("rejects read-only mode", () =>
    expect(validatePlaceOrder({ ...good, readOnlyMode: true }).ok).toBe(false));
  it("needs retailer, product, bags", () => {
    expect(validatePlaceOrder({ ...good, retailerId: null }).ok).toBe(false);
    expect(validatePlaceOrder({ ...good, productId: null }).ok).toBe(false);
    expect(validatePlaceOrder({ ...good, bags: 0 }).ok).toBe(false);
    expect(validatePlaceOrder({ ...good, bags: 1.5 }).ok).toBe(false);
  });
});

describe("isBagsInRange", () => {
  it("limits bags", () => {
    expect(isBagsInRange(1)).toBe(true);
    expect(isBagsInRange(100000)).toBe(true);
    expect(isBagsInRange(100001)).toBe(false);
    expect(isBagsInRange(0)).toBe(false);
  });
});

describe("retailer scoping", () => {
  it("retailer is fixed to own shop", () =>
    expect(resolveOrderRetailer("retailer", "mine", "other")).toBe("mine"));
  it("sales chooses", () => expect(resolveOrderRetailer("sales", null, "other")).toBe("other"));
  it("list scope", () => {
    expect(orderListScope("sales", null)).toEqual({ kind: "all" });
    expect(orderListScope("retailer", "mine")).toEqual({ kind: "retailer", retailerId: "mine" });
    expect(orderListScope("retailer", null)).toEqual({ kind: "none" });
  });
});

describe("chipStatus", () => {
  it("maps every status", () => {
    for (const s of ORDER_STATUSES) expect(chipStatus(s)).toBeTruthy();
    expect(chipStatus("rate_filled")).toBe("pending");
    expect(chipStatus("cancelled")).toBe("rejected");
    expect(chipStatus("partly_dispatched")).toBe("dispatched");
  });
});

describe("chipLabel", () => {
  it("names cancelled and partly dispatched orders honestly", () => {
    expect(chipLabel("cancelled")).toBe("Cancelled");
    expect(chipLabel("partly_dispatched")).toBe("Partly dispatched");
    expect(chipLabel("placed")).toBeUndefined();
  });
});

describe("canCancelOrder", () => {
  const before = { status: "placed", placedBy: "u1", salesRepId: "rep" };
  const after = { status: "approved", placedBy: "u1", salesRepId: "rep" };
  it("lets the placer or the assigned rep cancel before approval", () => {
    expect(canCancelOrder("sales", "u1", before)).toBe(true);
    expect(canCancelOrder("sales", "rep", before)).toBe(true);
    expect(canCancelOrder("sales", "rep", { ...before, status: "rate_filled" })).toBe(true);
  });
  it("refuses another sales person before approval", () => {
    expect(canCancelOrder("sales", "someone-else", before)).toBe(false);
  });
  it("refuses retailers and logistics", () => {
    expect(canCancelOrder("retailer", "u1", before)).toBe(false);
    expect(canCancelOrder("logistics", "rep", after)).toBe(false);
  });
  it("after approval only accounts or admin", () => {
    expect(canCancelOrder("accounts", "x", after)).toBe(true);
    expect(canCancelOrder("sales", "rep", after)).toBe(false);
    expect(canCancelOrder("admin", "x", after)).toBe(true);
    expect(canCancelOrder("admin", "x", before)).toBe(true);
  });
  it("refuses finished orders", () => {
    expect(canCancelOrder("admin", "x", { ...after, status: "dispatched" })).toBe(false);
    expect(canCancelOrder("admin", "x", { ...after, status: "cancelled" })).toBe(false);
    expect(canCancelOrder("admin", "x", { ...after, status: "nonsense" })).toBe(false);
  });
});
