import { describe, expect, it } from "vitest";
import {
  canCancelOrder,
  historyForViewer,
  historyStepLabel,
  mentionsMoney,
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
  const good = { bags: 10, retailerId: "r", productId: "p" };
  it("accepts a good order", () => expect(validatePlaceOrder(good)).toEqual({ ok: true }));
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

describe("historyForViewer", () => {
  const events = [
    { id: "1", toStatus: "placed", reason: "" },
    { id: "2", toStatus: "rejected", reason: "Dues too high" },
    { id: "3", toStatus: "assigned", reason: "Rate edited: market went up" },
    { id: "4", toStatus: "partly_dispatched", reason: "40 bags in KA01AB1234" },
    { id: "5", toStatus: "cancelled", reason: "Rate too low for this shop" },
    { id: "6", toStatus: "dispatched", reason: "Closed short: 60 bags not sent. Price dispute" },
    { id: "7", toStatus: "dispatched", reason: "Closed short: 1 bag not sent. Shop closed" },
    { id: "8", toStatus: "cancelled", reason: "Gave ₹10 off" },
  ];
  it("staff see everything", () => {
    expect(historyForViewer("sales", events)).toEqual(events);
    expect(historyForViewer("retailer,sales", events)).toEqual(events);
    expect(historyForViewer("admin", events)).toEqual(events);
  });
  it("a pure retailer never sees rate edits or money talk", () => {
    const seen = historyForViewer("retailer", events);
    expect(seen.map((e) => e.id)).toEqual(["1", "2", "4", "5", "6", "7", "8"]);
    const reason = (id: string) => seen.find((e) => e.id === id)?.reason;
    expect(reason("2")).toBe("Dues too high");
    expect(reason("4")).toBe("40 bags in KA01AB1234");
    expect(reason("5")).toBe("");
    expect(reason("6")).toBe("Closed short: 60 bags not sent.");
    expect(reason("7")).toBe("Closed short: 1 bag not sent. Shop closed");
    expect(reason("8")).toBe("");
  });
  it("spots money words", () => {
    for (const t of ["new RATE", "price", "₹400", "Rs 400", "rs.400", "400/-", "rupees", "discount", "cost"]) {
      expect(mentionsMoney(t)).toBe(true);
    }
    for (const t of ["", "Dues too high", "40 bags in KA01", "wrong product", "hrs late", "separate truck"]) {
      expect(mentionsMoney(t)).toBe(false);
    }
  });
});

describe("historyStepLabel", () => {
  it("shows a rate edit row (status unchanged) as Rate edited", () => {
    expect(historyStepLabel({ toStatus: "assigned", reason: "Rate edited: market went up" })).toBe("Rate edited");
    expect(historyStepLabel({ toStatus: "partly_dispatched", reason: "Rate edited: diesel" })).toBe("Rate edited");
  });
  it("shows other rows by their new status", () => {
    expect(historyStepLabel({ toStatus: "assigned", reason: "" })).toBe("Assigned");
    expect(historyStepLabel({ toStatus: "rate_filled", reason: "" })).toBe("Rate filled");
    // A second partial load keeps the status but is a real step, not a rate edit.
    expect(historyStepLabel({ toStatus: "partly_dispatched", reason: "40 bags in KA01AB1234" })).toBe("Partly dispatched");
  });
});
