import { describe, expect, it } from "vitest";
import {
  cancelledNote,
  historyForViewer,
  historyReason,
  historyStepLabel,
  mentionsMoney,
  canPlaceOrder,
  canSeePrice,
  isBagsInRange,
  isRetailerOnly,
  orderListScope,
  resolveOrderRetailer,
  validatePlaceOrder,
} from "./order-access";

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

describe("cancelledNote", () => {
  it("says how many bags went out before the rest was cancelled", () => {
    expect(cancelledNote("cancelled", 100, 40)).toBe("40 of 100 bags dispatched");
  });
  it("is empty when nothing was sent or the order is not cancelled", () => {
    expect(cancelledNote("cancelled", 100, 0)).toBeNull();
    expect(cancelledNote("partly_dispatched", 100, 40)).toBeNull();
  });
});

describe("historyForViewer", () => {
  const events = [
    { id: "1", toStatus: "placed", reason: "" },
    { id: "2", toStatus: "rejected", reason: "Dues too high" },
    { id: "3", toStatus: "approved", reason: "Rate edited: market went up" },
    { id: "4", toStatus: "partly_dispatched", reason: "40 bags in KA01AB1234" },
    { id: "5", toStatus: "cancelled", reason: "Rate too low for this shop" },
    { id: "6", toStatus: "placed", reason: "Rate filled" },
    { id: "7", toStatus: "cancelled", reason: "Shop closed" },
    { id: "8", toStatus: "cancelled", reason: "Gave ₹10 off" },
  ];
  it("staff see everything", () => {
    expect(historyForViewer("sales", events)).toEqual(events);
    expect(historyForViewer("retailer,sales", events)).toEqual(events);
    expect(historyForViewer("admin", events)).toEqual(events);
  });
  it("a pure retailer never sees rate rows or money talk", () => {
    const seen = historyForViewer("retailer", events);
    expect(seen.map((e) => e.id)).toEqual(["1", "2", "4", "5", "7", "8"]);
    const reason = (id: string) => seen.find((e) => e.id === id)?.reason;
    expect(reason("2")).toBe("Dues too high");
    expect(reason("4")).toBe("40 bags in KA01AB1234");
    expect(reason("5")).toBe("");
    expect(reason("7")).toBe("Shop closed");
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
  it("shows rate rows (status unchanged) as Rate filled / Rate edited", () => {
    expect(historyStepLabel({ toStatus: "approved", reason: "Rate edited: market went up" })).toBe("Rate edited");
    expect(historyStepLabel({ toStatus: "partly_dispatched", reason: "Rate edited: diesel" })).toBe("Rate edited");
    expect(historyStepLabel({ toStatus: "placed", reason: "Rate filled" })).toBe("Rate filled");
  });
  it("shows other rows by their new status", () => {
    expect(historyStepLabel({ toStatus: "approved", reason: "" })).toBe("Approved");
    // Old rows from before the simpler flow still read well.
    expect(historyStepLabel({ toStatus: "rate_filled", reason: "" })).toBe("Rate filled");
    // A second partial load keeps the status but is a real step, not a rate edit.
    expect(historyStepLabel({ toStatus: "partly_dispatched", reason: "40 bags in KA01AB1234" })).toBe("Partly dispatched");
  });
});

describe("historyReason", () => {
  it("drops the rate prefix and the bare rate-filled row", () => {
    expect(historyReason("Rate edited: diesel up")).toBe("diesel up");
    expect(historyReason("Rate filled")).toBe("");
    expect(historyReason("40 bags in KA01AB1234")).toBe("40 bags in KA01AB1234");
  });
});
