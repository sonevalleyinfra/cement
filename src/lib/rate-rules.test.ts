import { describe, expect, it } from "vitest";
import { orderTotalPaise } from "./order-rules";
import {
  canDecide,
  canFillRate,
  canLinkRetailerUser,
  checkRateDigits,
  checkRejectReason,
  MAX_RATE_RUPEES_PER_BAG,
  ratePaiseFromRupeeDigits,
} from "./rate-rules";

describe("ratePaiseFromRupeeDigits", () => {
  it("turns rupees into paise", () => expect(ratePaiseFromRupeeDigits("385")).toBe(38500));
  it("refuses zero, empty and non-digits", () => {
    expect(ratePaiseFromRupeeDigits("0")).toBeNull();
    expect(ratePaiseFromRupeeDigits("")).toBeNull();
    expect(ratePaiseFromRupeeDigits("3.5")).toBeNull();
  });
  it("amount = bags x rate in paise", () => {
    expect(orderTotalPaise(100, ratePaiseFromRupeeDigits("385") as number)).toBe(3850000);
  });
});

describe("rate sanity cap", () => {
  it("is ₹2,000 per bag", () => expect(MAX_RATE_RUPEES_PER_BAG).toBe(2000));
  it("accepts the cap itself", () => {
    expect(checkRateDigits("2000")).toEqual({ ok: true, paise: 200000 });
    expect(ratePaiseFromRupeeDigits("2000")).toBe(200000);
  });
  it("refuses anything above it with a clear message", () => {
    expect(checkRateDigits("2001")).toEqual({ ok: false, error: "Rate looks too high (max ₹2,000 per bag)." });
    expect(checkRateDigits("38500").ok).toBe(false);
    expect(ratePaiseFromRupeeDigits("2001")).toBeNull();
  });
  it("asks for a rate when empty, zero or not digits", () => {
    for (const d of ["", "0", "3.5", "abc", "-5"]) {
      expect(checkRateDigits(d)).toEqual({ ok: false, error: "Enter a rate per bag." });
    }
  });
  it("ignores spaces around the digits", () => expect(checkRateDigits(" 385 ")).toEqual({ ok: true, paise: 38500 }));
});

describe("canFillRate", () => {
  it("assigned sales rep can fill a placed order", () =>
    expect(canFillRate("sales", "u1", "u1", "placed")).toBe(true));
  it("another sales person cannot", () =>
    expect(canFillRate("sales", "u2", "u1", "placed")).toBe(false));
  it("admin can", () => expect(canFillRate("admin", "a", "u1", "placed")).toBe(true));
  it("not once the rate is filled", () =>
    expect(canFillRate("sales", "u1", "u1", "rate_filled")).toBe(false));
  it("accounts and retailers cannot", () => {
    expect(canFillRate("accounts", "u1", "u1", "placed")).toBe(false);
    expect(canFillRate("retailer", "u1", "u1", "placed")).toBe(false);
  });
});

describe("canDecide", () => {
  it("accounts and admin decide on rate_filled", () => {
    expect(canDecide("accounts", "rate_filled", "approved")).toBe(true);
    expect(canDecide("admin", "rate_filled", "rejected")).toBe(true);
  });
  it("sales cannot; placed orders cannot be decided", () => {
    expect(canDecide("sales", "rate_filled", "approved")).toBe(false);
    expect(canDecide("accounts", "placed", "approved")).toBe(false);
  });
});

describe("checkRejectReason", () => {
  it("needs a reason", () => {
    expect(checkRejectReason("  ").ok).toBe(false);
    expect(checkRejectReason(null).ok).toBe(false);
  });
  it("trims", () => expect(checkRejectReason(" high dues ")).toEqual({ ok: true, reason: "high dues" }));
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
