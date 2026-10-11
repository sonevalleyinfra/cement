import { describe, expect, it } from "vitest";
import {
  cancelledNote,
  historyForViewer,
  historyRateLine,
  historyReason,
  historyStepLabel,
  mentionsMoney,
  orderAmountSummary,
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
  it("default deny: no known staff role sees no price", () => {
    for (const role of [null, undefined, "", "user", "guest", "retailer", " , "]) expect(canSeePrice(role)).toBe(false);
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
    expect(orderListScope("logistics", null)).toEqual({ kind: "all" });
    expect(orderListScope("retailer", "mine")).toEqual({ kind: "retailer", retailerId: "mine" });
    expect(orderListScope("retailer", null)).toEqual({ kind: "none" });
  });
  it("a login with no known role sees only its own shop, never every order", () => {
    expect(orderListScope("user", null)).toEqual({ kind: "none" });
    expect(orderListScope(null, null)).toEqual({ kind: "none" });
    expect(orderListScope("guest", "mine")).toEqual({ kind: "retailer", retailerId: "mine" });
    expect(resolveOrderRetailer("user", null, "other")).toBeNull();
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
  it("a login with no known role is treated like a retailer", () => {
    expect(historyForViewer("user", events).map((e) => e.id)).toEqual(["1", "2", "4", "5", "7", "8"]);
    expect(historyForViewer(null, events).map((e) => e.id)).toEqual(["1", "2", "4", "5", "7", "8"]);
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

describe("historyRateLine", () => {
  it("staff see old → new rate on a rate row", () => {
    expect(historyRateLine("accounts", { fromRatePaise: 35000, toRatePaise: 36000 })).toBe("₹350 → ₹360");
    expect(historyRateLine("admin", { fromRatePaise: null, toRatePaise: 35050 })).toBe("₹350.50");
  });
  it("nobody else sees it, and other rows have none", () => {
    for (const role of ["retailer", "user", null]) {
      expect(historyRateLine(role, { fromRatePaise: 35000, toRatePaise: 36000 })).toBeNull();
    }
    expect(historyRateLine("sales", { fromRatePaise: null, toRatePaise: null })).toBeNull();
  });
});

describe("orderAmountSummary", () => {
  it("nothing sent: the order's rate and the total at that rate", () => {
    expect(orderAmountSummary({ status: "approved", bags: 50, ratePaise: 36000, loads: [] })).toEqual({
      caption: "Rate ₹360.00 per bag",
      totalPaise: 1_800_000,
      lines: [],
    });
  });
  it("no rate yet: nothing to show", () => {
    expect(orderAmountSummary({ status: "placed", bags: 50, ratePaise: null, loads: [] })).toBeNull();
  });
  it("partly dispatched: total, billed so far and the bags still to send at the current rate", () => {
    const a = orderAmountSummary({
      status: "partly_dispatched",
      bags: 100,
      ratePaise: 37000,
      loads: [{ bags: 40, ratePaise: 36000 }],
    });
    expect(a).toEqual({
      caption: "Total",
      totalPaise: 40 * 36000 + 60 * 37000,
      lines: ["Billed ₹14,400.00", "60 bags not sent, at ₹370.00 per bag"],
    });
  });
  it("one bag left is singular", () => {
    const a = orderAmountSummary({ status: "partly_dispatched", bags: 41, ratePaise: 36000, loads: [{ bags: 40, ratePaise: 36000 }] });
    expect(a?.lines[1]).toBe("1 bag not sent, at ₹360.00 per bag");
  });
  it("cancelled after some bags went out: only what was billed, no single rate", () => {
    const a = orderAmountSummary({ status: "cancelled", bags: 100, ratePaise: 36000, loads: [{ bags: 40, ratePaise: 35000 }] });
    expect(a).toEqual({ caption: "Billed", totalPaise: 1_400_000, lines: [] });
  });
  it("cancelled or rejected with nothing sent: nothing, so no misleading rate", () => {
    expect(orderAmountSummary({ status: "cancelled", bags: 100, ratePaise: 36000, loads: [] })).toBeNull();
    expect(orderAmountSummary({ status: "rejected", bags: 100, ratePaise: 36000, loads: [] })).toBeNull();
  });
  it("fully dispatched at different rates: the billed total", () => {
    const a = orderAmountSummary({
      status: "dispatched",
      bags: 100,
      ratePaise: 37000,
      loads: [
        { bags: 40, ratePaise: 36000 },
        { bags: 60, ratePaise: 37000 },
      ],
    });
    expect(a).toEqual({ caption: "Billed", totalPaise: 40 * 36000 + 60 * 37000, lines: [] });
  });
});
