import { describe, expect, it } from "vitest";
import { orderTotalPaise } from "./order-rules";
import {
  canChangeRate,
  canDecide,
  canFillRate,
  canLinkRetailerUser,
  checkRateChange,
  checkRateInput,
  checkRejectReason,
  cleanRateInput,
  isRateEvent,
  isWaitingApproval,
  MAX_RATE_RUPEES_PER_BAG,
  RATE_FILLED,
  rateChangePreview,
  rateEditReason,
  rateEventLabel,
  rateOnPlace,
} from "./rate-rules";

const TOO_HIGH = { ok: false, error: "Rate looks too high (max ₹2,000 per bag)." };
const ASK = { ok: false, error: "Enter a rate per bag." };

describe("checkRateInput", () => {
  it("turns whole rupees into paise", () => expect(checkRateInput("385")).toEqual({ ok: true, paise: 38500 }));
  it("amount = bags x rate in paise", () => {
    const r = checkRateInput("385");
    expect(r.ok && orderTotalPaise(100, r.paise)).toBe(3850000);
  });
  it("takes rupees and paise", () => {
    const cases: [string, number][] = [
      ["335.50", 33550],
      ["335.5", 33550],
      ["335.", 33500],
      [".5", 50],
      [".05", 5],
      ["3.50", 350], // the old digits-only field turned this into ₹350 (35000)
      ["0.01", 1],
    ];
    for (const [text, paise] of cases) expect(checkRateInput(text)).toEqual({ ok: true, paise });
  });
  it("refuses more than 2 digits after the dot (never rounds)", () => {
    expect(checkRateInput("335.505")).toEqual({ ok: false, error: "Use at most 2 digits after the dot." });
  });
  it("is capped at ₹2,000 per bag", () => {
    expect(MAX_RATE_RUPEES_PER_BAG).toBe(2000);
    expect(checkRateInput("2000")).toEqual({ ok: true, paise: 200000 });
    expect(checkRateInput("2000.01")).toEqual(TOO_HIGH);
    expect(checkRateInput("2001")).toEqual(TOO_HIGH);
    expect(checkRateInput("123456")).toEqual(TOO_HIGH);
  });
  it("asks for a rate when empty, zero or not a number", () => {
    for (const d of ["1.2.3", "abc", "", ".", "-5", "0", "0.00"]) expect(checkRateInput(d)).toEqual(ASK);
  });
  it("ignores leading zeros", () => {
    expect(checkRateInput("00335.5")).toEqual({ ok: true, paise: 33550 });
    expect(checkRateInput("0.5")).toEqual({ ok: true, paise: 50 });
  });
  it("ignores spaces around the rate", () => expect(checkRateInput(" 385 ")).toEqual({ ok: true, paise: 38500 }));
  it("answers huge input quickly", () => {
    for (const text of ["1".repeat(100_000), "1".repeat(100_000) + ".5"]) {
      const start = performance.now();
      expect(checkRateInput(text)).toEqual(TOO_HIGH);
      expect(performance.now() - start).toBeLessThan(50);
    }
  });
});

describe("cleanRateInput", () => {
  it("drops the rupee sign, Rs, INR, commas and spaces", () => {
    expect(cleanRateInput("₹ 335.50")).toBe("335.50");
    expect(cleanRateInput("Rs. 350")).toBe("350");
    expect(cleanRateInput("rs350")).toBe("350");
    expect(cleanRateInput("INR 1,234.50")).toBe("1234.50");
    expect(cleanRateInput("33 5")).toBe("335");
  });
  it("keeps every digit and dot, and never cuts the length", () => {
    expect(cleanRateInput("335.50")).toBe("335.50");
    expect(cleanRateInput("3.50")).toBe("3.50");
    expect(cleanRateInput("1,23,456")).toBe("123456");
    expect(checkRateInput(cleanRateInput("1,23,456"))).toEqual(TOO_HIGH);
  });
  it("keeps a comma that is not a thousands group, so it is refused (never ₹350 for 3,50)", () => {
    expect(cleanRateInput("3,50")).toBe("3,50");
    expect(checkRateInput(cleanRateInput("3,50"))).toEqual({ ok: false, error: "Use a dot for paise, like 335.50." });
    expect(cleanRateInput("1,999.50")).toBe("1999.50");
  });
  it("a pasted rate round-trips to paise", () => {
    expect(checkRateInput(cleanRateInput("₹ 335.50"))).toEqual({ ok: true, paise: 33550 });
  });
});

describe("rateChangePreview", () => {
  it("40-bag order, 15 sent at ₹330, 25 left at a new ₹340", () => {
    const billedPaise = orderTotalPaise(15, 33000);
    expect(billedPaise).toBe(495000);
    expect(rateChangePreview({ unsentBags: 25, billedPaise, newRatePaise: 34000 })).toEqual({
      unsentPaise: 850000,
      orderTotalPaise: 1345000,
    });
  });
  it("works with a paise rate (₹335.50)", () => {
    expect(rateChangePreview({ unsentBags: 25, billedPaise: 495000, newRatePaise: 33550 })).toEqual({
      unsentPaise: 838750,
      orderTotalPaise: 1333750,
    });
  });
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

describe("canFillRate (sales only fill an empty rate)", () => {
  const placed = { status: "placed", salesRepId: "u1", ratePaise: null };
  it("the order's sales person can fill an empty rate while placed", () => {
    expect(canFillRate("sales", "u1", placed)).toBe(true);
  });
  it("once a rate is set, nobody fills it again (sales cannot change it)", () => {
    expect(canFillRate("sales", "u1", { ...placed, ratePaise: 35000 })).toBe(false);
    expect(canFillRate("admin", "a", { ...placed, ratePaise: 35000 })).toBe(false);
  });
  it("another sales person cannot", () => expect(canFillRate("sales", "u2", placed)).toBe(false));
  it("admin can fill an empty rate", () => expect(canFillRate("admin", "a", placed)).toBe(true));
  it("not after approval or once finished", () => {
    for (const status of ["approved", "partly_dispatched", "dispatched", "rejected", "cancelled"]) {
      expect(canFillRate("sales", "u1", { ...placed, status })).toBe(false);
      expect(canFillRate("admin", "a", { ...placed, status })).toBe(false);
    }
  });
  it("accounts, logistics and retailers cannot", () => {
    for (const role of ["accounts", "logistics", "retailer"]) expect(canFillRate(role, "u1", placed)).toBe(false);
  });
  it("nobody but admin when the shop has no sales person", () => {
    expect(canFillRate("sales", "u1", { ...placed, salesRepId: null })).toBe(false);
    expect(canFillRate("admin", "a", { ...placed, salesRepId: null })).toBe(true);
  });
});

describe("canChangeRate (logistics and admin alter a set rate)", () => {
  it("logistics and admin, at any step before fully dispatched", () => {
    for (const status of ["placed", "approved", "partly_dispatched"]) {
      expect(canChangeRate("logistics", { status, ratePaise: 35000 })).toBe(true);
      expect(canChangeRate("admin", { status, ratePaise: 35000 })).toBe(true);
    }
  });
  it("not once fully dispatched, rejected or cancelled", () => {
    for (const status of ["rejected", "dispatched", "cancelled"]) {
      expect(canChangeRate("logistics", { status, ratePaise: 35000 })).toBe(false);
      expect(canChangeRate("admin", { status, ratePaise: 35000 })).toBe(false);
    }
  });
  it("an empty rate is filled, not changed", () => {
    expect(canChangeRate("logistics", { status: "placed", ratePaise: null })).toBe(false);
    expect(canChangeRate("admin", { status: "placed", ratePaise: null })).toBe(false);
  });
  it("sales (even the order's own), accounts and retailers cannot", () => {
    for (const role of ["sales", "accounts", "retailer", null]) {
      for (const status of ["placed", "approved"]) expect(canChangeRate(role, { status, ratePaise: 35000 })).toBe(false);
    }
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
    expect(checkRateChange(33500, "335.00", "x")).toEqual({ ok: false, error: "That is the rate already." });
  });
  it("takes a paise rate", () => {
    expect(checkRateChange(33500, "335.50", "x")).toEqual({ ok: true, ratePaise: 33550, reason: "x" });
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
