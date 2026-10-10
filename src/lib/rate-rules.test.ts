import { describe, expect, it } from "vitest";
import { orderTotalPaise } from "./order-rules";
import {
  canChangeRate,
  canDecide,
  canFillRate,
  canLinkRetailerUser,
  checkRateChange,
  checkRateDigits,
  checkRejectReason,
  isRateEvent,
  isWaitingApproval,
  MAX_RATE_RUPEES_PER_BAG,
  RATE_FILLED,
  rateEditReason,
  rateEventLabel,
  rateOnPlace,
} from "./rate-rules";

describe("checkRateDigits", () => {
  it("turns whole rupees into paise", () => expect(checkRateDigits("385")).toEqual({ ok: true, paise: 38500 }));
  it("amount = bags x rate in paise", () => {
    const r = checkRateDigits("385");
    expect(r.ok && orderTotalPaise(100, r.paise)).toBe(3850000);
  });
  it("is capped at ₹2,000 per bag", () => {
    expect(MAX_RATE_RUPEES_PER_BAG).toBe(2000);
    expect(checkRateDigits("2000")).toEqual({ ok: true, paise: 200000 });
    expect(checkRateDigits("2001")).toEqual({ ok: false, error: "Rate looks too high (max ₹2,000 per bag)." });
    expect(checkRateDigits("38500").ok).toBe(false);
  });
  it("asks for a rate when empty, zero or not digits", () => {
    for (const d of ["", "0", "3.5", "abc", "-5"]) {
      expect(checkRateDigits(d)).toEqual({ ok: false, error: "Enter a rate per bag." });
    }
  });
  it("ignores spaces around the digits", () => expect(checkRateDigits(" 385 ")).toEqual({ ok: true, paise: 38500 }));
});

describe("rateOnPlace", () => {
  it("sales must type the rate", () => {
    expect(rateOnPlace("sales", "350")).toEqual({ ok: true, ratePaise: 35000 });
    expect(rateOnPlace("sales", "")).toEqual({ ok: false, error: "Enter a rate per bag." });
    expect(rateOnPlace("sales", undefined).ok).toBe(false);
  });
  it("admin (and anyone who is also staff) must type it too", () => {
    expect(rateOnPlace("admin", "").ok).toBe(false);
    expect(rateOnPlace("retailer,sales", "").ok).toBe(false);
    expect(rateOnPlace("admin", "400")).toEqual({ ok: true, ratePaise: 40000 });
  });
  it("a retailer never sends a rate: anything sent is ignored", () => {
    expect(rateOnPlace("retailer", "")).toEqual({ ok: true, ratePaise: null });
    expect(rateOnPlace("retailer", "1")).toEqual({ ok: true, ratePaise: null });
    expect(rateOnPlace("retailer", undefined)).toEqual({ ok: true, ratePaise: null });
  });
});

describe("canFillRate", () => {
  const placed = { status: "placed", salesRepId: "u1" };
  it("the order's sales person can fill or change it while placed", () => {
    expect(canFillRate("sales", "u1", placed)).toBe(true);
  });
  it("another sales person cannot", () => expect(canFillRate("sales", "u2", placed)).toBe(false));
  it("admin can", () => expect(canFillRate("admin", "a", placed)).toBe(true));
  it("not after approval (that is a rate change with a reason)", () => {
    for (const status of ["approved", "partly_dispatched", "dispatched", "rejected", "cancelled"]) {
      expect(canFillRate("sales", "u1", { ...placed, status })).toBe(false);
      expect(canFillRate("admin", "a", { ...placed, status })).toBe(false);
    }
  });
  it("accounts, logistics and retailers cannot", () => {
    for (const role of ["accounts", "logistics", "retailer"]) expect(canFillRate(role, "u1", placed)).toBe(false);
  });
  it("nobody but admin when the shop has no sales person", () => {
    expect(canFillRate("sales", "u1", { status: "placed", salesRepId: null })).toBe(false);
    expect(canFillRate("admin", "a", { status: "placed", salesRepId: null })).toBe(true);
  });
});

describe("canChangeRate", () => {
  it("logistics and admin, after approval", () => {
    for (const status of ["approved", "partly_dispatched"]) {
      expect(canChangeRate("logistics", status)).toBe(true);
      expect(canChangeRate("admin", status)).toBe(true);
    }
  });
  it("not before approval or once finished", () => {
    for (const status of ["placed", "rejected", "dispatched", "cancelled"]) {
      expect(canChangeRate("logistics", status)).toBe(false);
      expect(canChangeRate("admin", status)).toBe(false);
    }
  });
  it("sales, accounts and retailers cannot", () => {
    for (const role of ["sales", "accounts", "retailer", null]) expect(canChangeRate(role, "approved")).toBe(false);
  });
});

describe("checkRateChange", () => {
  it("needs a valid new rate and a reason", () => {
    expect(checkRateChange(35000, "360", " freight up ")).toEqual({ ok: true, ratePaise: 36000, reason: "freight up" });
    expect(checkRateChange(35000, "360", " ")).toEqual({ ok: false, error: "Enter a reason for changing the rate." });
    expect(checkRateChange(35000, "", "x")).toEqual({ ok: false, error: "Enter a rate per bag." });
    expect(checkRateChange(35000, "5000", "x").ok).toBe(false);
  });
  it("the same rate is not a change", () => {
    expect(checkRateChange(35000, "350", "x")).toEqual({ ok: false, error: "That is the rate already." });
  });
});

describe("canDecide", () => {
  const ready = { status: "placed", ratePaise: 35000 };
  it("accounts and admin decide on a placed order with a rate", () => {
    expect(canDecide("accounts", ready, "approved", 35000)).toEqual({ ok: true });
    expect(canDecide("admin", ready, "rejected", 35000)).toEqual({ ok: true });
  });
  it("refused while the rate is missing", () => {
    expect(canDecide("accounts", { ...ready, ratePaise: null }, "approved", null)).toEqual({
      ok: false,
      error: "The rate is not filled yet.",
    });
    expect(canDecide("accounts", { ...ready, ratePaise: null }, "rejected", null).ok).toBe(false);
  });
  it("refused when the rate changed after accounts saw it, naming the new rate", () => {
    expect(canDecide("accounts", { ...ready, ratePaise: 36000 }, "approved", 35000)).toEqual({
      ok: false,
      error: "Rate changed to ₹360.00, check again.",
    });
    expect(canDecide("accounts", { ...ready, ratePaise: 36050 }, "rejected", 35000)).toEqual({
      ok: false,
      error: "Rate changed to ₹360.50, check again.",
    });
  });
  it("refused when the screen sent no rate", () => {
    for (const seen of [undefined, null, "35000", 350.5]) {
      expect(canDecide("accounts", ready, "approved", seen)).toEqual({ ok: false, error: "Refresh the page and try again." });
    }
  });
  it("sales, logistics and retailers cannot; other statuses cannot be decided", () => {
    for (const role of ["sales", "logistics", "retailer"]) expect(canDecide(role, ready, "approved", 35000).ok).toBe(false);
    for (const status of ["approved", "rejected", "partly_dispatched", "cancelled"]) {
      expect(canDecide("accounts", { ...ready, status }, "approved", 35000)).toEqual({
        ok: false,
        error: "This order is not waiting for approval.",
      });
    }
  });
});

describe("isWaitingApproval", () => {
  it("placed with a rate", () => {
    expect(isWaitingApproval({ status: "placed", ratePaise: 35000 })).toBe(true);
    expect(isWaitingApproval({ status: "placed", ratePaise: null })).toBe(false);
    expect(isWaitingApproval({ status: "approved", ratePaise: 35000 })).toBe(false);
  });
});

describe("checkRejectReason", () => {
  it("needs a reason", () => {
    expect(checkRejectReason("  ").ok).toBe(false);
    expect(checkRejectReason(null).ok).toBe(false);
  });
  it("trims", () => expect(checkRejectReason(" high dues ")).toEqual({ ok: true, reason: "high dues" }));
});

describe("rate history rows", () => {
  it("never contain the price and are recognisable", () => {
    expect(rateEditReason("market fell")).toBe("Rate edited: market fell");
    expect(isRateEvent(rateEditReason("x"))).toBe(true);
    expect(isRateEvent(RATE_FILLED)).toBe(true);
    expect(isRateEvent("40 bags in KA01")).toBe(false);
    expect(isRateEvent(null)).toBe(false);
  });
  it("have their own step names", () => {
    expect(rateEventLabel(RATE_FILLED)).toBe("Rate filled");
    expect(rateEventLabel(rateEditReason("x"))).toBe("Rate edited");
    expect(rateEventLabel("wrong product")).toBeNull();
  });
});

describe("canLinkRetailerUser", () => {
  const links = [
    { retailerId: "r1", userId: "u1" },
    { retailerId: "r2", userId: null },
  ];
  it("one user links to one retailer", () => {
    expect(canLinkRetailerUser("u1", "r2", links).ok).toBe(false);
  });
  it("re-linking the same retailer is fine", () => {
    expect(canLinkRetailerUser("u1", "r1", links).ok).toBe(true);
  });
  it("a free user is fine", () => expect(canLinkRetailerUser("u3", "r2", links).ok).toBe(true));
});
