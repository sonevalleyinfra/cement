import { describe, expect, it } from "vitest";
import {
  assessCredit,
  creditPill,
  exposureLine,
  lastPaymentText,
  meterPercent,
  notSentPaise,
  oldestOverdueDays,
  overrideNeededError,
  overridesByReason,
  overridesMonthText,
  overrideTotals,
  termsText,
  type ShopCreditFacts,
} from "./credit-check-rules";

const facts = (over: Partial<ShopCreditFacts> = {}): ShopCreditFacts => ({
  balancePaise: 1_00_000_00,
  notSentPaise: 20_000_00,
  oldestOverdueDays: 0,
  limitPaise: 1_50_000_00,
  creditDays: null,
  status: "ok",
  lastPayment: null,
  ...over,
});

describe("assessCredit: the limit", () => {
  it("adds dues, not sent and this order", () => {
    const a = assessCredit(facts(), 18_000_00);
    expect(a.afterPaise).toBe(1_38_000_00);
    expect(a.overLimitByPaise).toBe(0);
    expect(a.flags).toEqual([]);
    expect(a.needsOverride).toBe(false);
    expect(a.headlines).toEqual([]);
    expect(a.noLimit).toBe(false);
  });

  it("exactly at the limit is not over", () => {
    const a = assessCredit(facts(), 30_000_00);
    expect(a.afterPaise).toBe(1_50_000_00);
    expect(a.overLimitByPaise).toBe(0);
    expect(a.needsOverride).toBe(false);
  });

  it("1 paisa over is over", () => {
    const a = assessCredit(facts(), 30_000_01);
    expect(a.overLimitByPaise).toBe(1);
    expect(a.flags).toEqual(["over_limit"]);
    expect(a.needsOverride).toBe(true);
    expect(a.headlines).toEqual(["Over limit by ₹0.01"]);
  });

  it("a limit of 0 is over with any exposure, but not when an advance covers it", () => {
    expect(assessCredit(facts({ limitPaise: 0, balancePaise: 0, notSentPaise: 0 }), 100).flags).toEqual(["over_limit"]);
    const covered = assessCredit(facts({ limitPaise: 0, balancePaise: -500, notSentPaise: 0 }), 500);
    expect(covered.afterPaise).toBe(0);
    expect(covered.needsOverride).toBe(false);
  });

  it("no limit set: amber, never over the limit, 30-day terms", () => {
    const a = assessCredit(facts({ limitPaise: null, balancePaise: 99_00_000_00 }), 5_00_000_00);
    expect(a.noLimit).toBe(true);
    expect(a.overLimitByPaise).toBe(0);
    expect(a.overLimitPaiseApproved).toBe(0);
    expect(a.flags).toEqual([]);
    expect(a.needsOverride).toBe(false);
    expect(a.creditDays).toBe(30);
  });

  it("an advance lowers the exposure", () => {
    const a = assessCredit(facts({ balancePaise: -40_000_00, notSentPaise: 0, limitPaise: 1_00_000_00 }), 1_30_000_00);
    expect(a.afterPaise).toBe(90_000_00);
    expect(a.needsOverride).toBe(false);
  });

  it("refuses amounts that are not whole paise", () => {
    expect(() => assessCredit(facts(), 1.5)).toThrow(RangeError);
  });
});

describe("overLimitPaiseApproved: only this order's part over the limit", () => {
  it("is the whole order when the shop was already over", () => {
    const a = assessCredit(facts({ balancePaise: 2_00_000_00 }), 18_000_00);
    expect(a.overLimitByPaise).toBe(88_000_00);
    expect(a.overLimitPaiseApproved).toBe(18_000_00);
  });
  it("is the part over when the order crosses the limit", () => {
    const a = assessCredit(facts(), 38_000_00);
    expect(a.overLimitByPaise).toBe(8_000_00);
    expect(a.overLimitPaiseApproved).toBe(8_000_00);
  });
  it("is 0 for an overdue-only or hold override", () => {
    expect(assessCredit(facts({ oldestOverdueDays: 12 }), 1_000).overLimitPaiseApproved).toBe(0);
    expect(assessCredit(facts({ status: "hold" }), 1_000).overLimitPaiseApproved).toBe(0);
  });
});

describe("assessCredit: overdue, hold and blocked", () => {
  it("overdue days set the overdue flag", () => {
    const a = assessCredit(facts({ oldestOverdueDays: 42 }), 1_000);
    expect(a.flags).toEqual(["overdue"]);
    expect(a.headlines).toEqual(["Overdue 42 days"]);
    expect(a.needsOverride).toBe(true);
  });
  it("hold and blocked set their flags", () => {
    expect(assessCredit(facts({ status: "hold" }), 1_000).headlines).toEqual(["Shop on hold"]);
    expect(assessCredit(facts({ status: "blocked" }), 1_000).headlines).toEqual(["Shop blocked"]);
    expect(assessCredit(facts({ status: "ok" }), 1_000).needsOverride).toBe(false);
  });
  it("no limit does not stop overdue from turning it red", () => {
    const a = assessCredit(facts({ limitPaise: null, oldestOverdueDays: 3 }), 1_000);
    expect(a.noLimit).toBe(true);
    expect(a.flags).toEqual(["overdue"]);
  });
  it("headlines: over limit first, then the others, at most 3", () => {
    const a = assessCredit(facts({ balancePaise: 1_68_000_00, oldestOverdueDays: 1, status: "blocked" }), 20_000_00);
    expect(a.flags).toEqual(["over_limit", "overdue", "blocked"]);
    expect(a.headlines).toEqual(["Over limit by ₹58,000", "Overdue 1 day", "Shop blocked"]);
    const many = assessCredit(facts({ balancePaise: 1_68_000_00, oldestOverdueDays: 5, status: "hold" }), 1);
    expect(many.headlines).toHaveLength(3);
  });
});

describe("notSentPaise", () => {
  it("counts the bags still to go at the order rate", () => {
    expect(
      notSentPaise([
        { bags: 100, dispatchedBags: 40, ratePaise: 350_00 },
        { bags: 10, dispatchedBags: 0, ratePaise: 400_00 },
      ]),
    ).toBe(60 * 350_00 + 10 * 400_00);
  });
  it("never negative per order, and a missing rate counts 0", () => {
    expect(notSentPaise([{ bags: 10, dispatchedBags: 12, ratePaise: 350_00 }])).toBe(0);
    expect(notSentPaise([{ bags: 10, dispatchedBags: 0, ratePaise: null }])).toBe(0);
    expect(notSentPaise([])).toBe(0);
  });
});

describe("oldestOverdueDays", () => {
  const row = (createdAt: string, amountPaise: number, kind = "order_debit") => ({ kind, amountPaise, orderId: null, createdAt });
  it("uses the 30-day default when the shop has no days", () => {
    expect(oldestOverdueDays([row("2026-09-01T06:00:00Z", 10_000)], null, "2026-10-12")).toBe(11);
    expect(oldestOverdueDays([row("2026-09-12T06:00:00Z", 10_000)], null, "2026-10-12")).toBe(0);
  });
  it("uses the shop's own credit days", () => {
    expect(oldestOverdueDays([row("2026-09-01T06:00:00Z", 10_000)], 45, "2026-10-12")).toBe(0);
    expect(oldestOverdueDays([row("2026-09-01T06:00:00Z", 10_000)], 7, "2026-10-12")).toBe(34);
  });
  it("a payment clears the oldest item first", () => {
    const rows = [row("2026-08-01T06:00:00Z", 10_000), row("2026-10-01T06:00:00Z", 10_000), row("2026-10-02T06:00:00Z", -10_000, "receipt_credit")];
    expect(oldestOverdueDays(rows, null, "2026-10-12")).toBe(0);
  });
});

describe("words", () => {
  it("override errors fit the first flag", () => {
    expect(overrideNeededError(["over_limit", "overdue"])).toBe("Over the limit now. Pick a reason.");
    expect(overrideNeededError(["overdue"])).toBe("Dues are overdue. Pick a reason.");
    expect(overrideNeededError(["hold"])).toBe("Shop is on hold. Pick a reason.");
    expect(overrideNeededError(["blocked"])).toBe("Shop is blocked. Pick a reason.");
  });
  it("the pill follows the first flag", () => {
    expect(creditPill(["over_limit", "hold"])).toBe("Over limit");
    expect(creditPill(["overdue"])).toBe("Overdue");
    expect(creditPill(["hold"])).toBe("On hold");
    expect(creditPill(["blocked"])).toBe("Blocked");
    expect(creditPill([])).toBeNull();
  });
  it("exposure line shows Advance instead of Due when paid ahead", () => {
    expect(exposureLine({ balancePaise: 1_00_000_00, notSentPaise: 20_000_00, thisOrderPaise: 18_000_00 })).toBe(
      "Due ₹1,00,000 · Not sent ₹20,000 · This ₹18,000",
    );
    expect(exposureLine({ balancePaise: -5_000_00, notSentPaise: 0, thisOrderPaise: 100 })).toBe("Advance ₹5,000 · Not sent ₹0 · This ₹1");
  });
  it("terms and last payment", () => {
    expect(termsText(30)).toBe("30-day terms");
    expect(termsText(45)).toBe("45-day terms");
    expect(lastPaymentText(null)).toBe("None");
    expect(lastPaymentText({ totalPaise: 25_000_00, receivedOn: "2026-10-12" })).toBe("₹25,000 · 12 Oct");
  });
});

describe("meterPercent", () => {
  it("fills to the share of the limit, full when over, none without a limit", () => {
    expect(meterPercent(75, 100)).toBe(75);
    expect(meterPercent(100, 100)).toBe(100);
    expect(meterPercent(250, 100)).toBe(100);
    expect(meterPercent(-50, 100)).toBe(0);
    expect(meterPercent(10, 0)).toBe(100);
    expect(meterPercent(0, 0)).toBe(0);
    expect(meterPercent(10, null)).toBeNull();
  });
});

describe("overrides counted", () => {
  const rows = [
    { reasonCode: "payment_promised", orderPaise: 1000, overLimitPaise: 400 },
    { reasonCode: "old_customer", orderPaise: 2000, overLimitPaise: 0 },
    { reasonCode: "payment_promised", orderPaise: 500, overLimitPaise: 500 },
  ];
  it("totals", () => {
    expect(overrideTotals(rows)).toEqual({ count: 3, overLimitPaise: 900, orderPaise: 3500 });
    expect(overrideTotals([])).toEqual({ count: 0, overLimitPaise: 0, orderPaise: 0 });
  });
  it("by reason, most first", () => {
    expect(overridesByReason(rows)).toEqual([
      { code: "payment_promised", label: "Will pay soon", count: 2 },
      { code: "old_customer", label: "Old customer", count: 1 },
    ]);
  });
  it("owner Home text", () => {
    expect(overridesMonthText({ count: 0, overLimitPaise: 0 })).toBe("No overrides this month");
    expect(overridesMonthText({ count: 1, overLimitPaise: 0 })).toBe("1 override this month");
    expect(overridesMonthText({ count: 3, overLimitPaise: 38_000_00 })).toBe("3 overrides this month · ₹38,000 over limit");
  });
});
