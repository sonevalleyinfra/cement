import { describe, expect, it } from "vitest";
import {
  balanceOf,
  canViewLedger,
  cancelEntry,
  duesFrom,
  MAX_OPENING_PAISE,
  openingEntry,
  orderDebitEntry,
  orderDebitPaise,
  truckRateChangeEntry,
  sumPaise,
  withRunningBalance,
} from "./ledger-rules";

const e = (retailerId: string, amountPaise: number, orderId?: string) => ({
  retailerId,
  amountPaise,
  orderId,
});

describe("running balance", () => {
  it("adds up row by row", () => {
    const r = withRunningBalance([{ amountPaise: 100 }, { amountPaise: -30 }, { amountPaise: 50 }]);
    expect(r.map((x) => x.balancePaise)).toEqual([100, 70, 120]);
  });
  it("is empty for no entries", () => expect(withRunningBalance([])).toEqual([]));
  it("can go negative (advance)", () =>
    expect(withRunningBalance([{ amountPaise: -500 }])[0].balancePaise).toBe(-500));
});

describe("balance", () => {
  const rows = [e("r1", 1000), e("r1", 500), e("r1", -200), e("r2", 9999)];
  it("adds up one retailer's entries", () => expect(balanceOf(rows, "r1")).toBe(1300));
  it("never mixes retailers", () => expect(balanceOf(rows, "r2")).toBe(9999));
  it("is zero with no entries", () => expect(balanceOf([], "r1")).toBe(0));
  it("can be negative (advance)", () => expect(balanceOf([e("r1", 400), e("r1", -1000)], "r1")).toBe(-600));
});

describe("dues", () => {
  it("advance is not negative dues", () => {
    expect(duesFrom(-100)).toBe(0);
    expect(duesFrom(250)).toBe(250);
  });
});

describe("order debit", () => {
  it("is bags x rate in paise", () => expect(orderDebitPaise(100, 33000)).toBe(3300000));
  it("refuses missing or bad input", () => {
    expect(orderDebitPaise(0, 100)).toBeNull();
    expect(orderDebitPaise(1.5, 100)).toBeNull();
    expect(orderDebitPaise(10, null)).toBeNull();
    expect(orderDebitPaise(10, 0)).toBeNull();
    expect(orderDebitPaise(10, 10.5)).toBeNull();
  });
  it("allows totals above the old 32-bit limit (₹2.15 crore)", () =>
    expect(orderDebitPaise(100000, 100000)).toBe(10_000_000_000));
  it("refuses totals JavaScript cannot count exactly", () =>
    expect(orderDebitPaise(1_000_000_000, 100_000_000)).toBeNull());
  it("builds a debit entry", () => {
    const r = orderDebitEntry({ id: "o1", retailerId: "r1", bags: 10, ratePaise: 40000 });
    expect(r).toEqual({
      ok: true,
      entry: { retailerId: "r1", kind: "order_debit", amountPaise: 400000, orderId: "o1" },
    });
  });
  it("fails without a rate", () =>
    expect(orderDebitEntry({ id: "o1", retailerId: "r1", bags: 10, ratePaise: null }).ok).toBe(false));
});

describe("truck rate change", () => {
  const o = { id: "o1", retailerId: "r1" };
  it("bills only this truck's bags at the difference", () => {
    // 100 bags ordered at ₹400; this truck takes 30 bags at ₹410.
    expect(truckRateChangeEntry(o, 30, 40000, 41000)).toEqual({
      retailerId: "r1",
      kind: "adjustment",
      amountPaise: 30000,
      orderId: "o1",
    });
    expect(truckRateChangeEntry(o, 30, 40000, 39000)?.amountPaise).toBe(-30000);
  });
  it("adds nothing when unchanged or a value is missing", () => {
    expect(truckRateChangeEntry(o, 30, 40000, 40000)).toBeNull();
    expect(truckRateChangeEntry(o, 30, null, 41000)).toBeNull();
    expect(truckRateChangeEntry(o, 30, 40000, null)).toBeNull();
    expect(truckRateChangeEntry(o, 0, 40000, 41000)).toBeNull();
  });
});

describe("cancel entry", () => {
  const o = { id: "o1", retailerId: "r1" };
  it("posts the given amount for the order", () => {
    expect(cancelEntry(o, -2400000)).toEqual({
      retailerId: "r1",
      kind: "adjustment",
      amountPaise: -2400000,
      orderId: "o1",
    });
  });
  it("posts nothing for zero or a broken amount", () => {
    expect(cancelEntry(o, 0)).toBeNull();
    expect(cancelEntry(o, 1.5)).toBeNull();
    expect(cancelEntry(o, Number.NaN)).toBeNull();
  });
  it("a full cancel brings the order back to zero", () => {
    const posted = [e("r1", 400000, "o1"), e("r1", 10000, "o1")];
    const entry = cancelEntry(o, -sumPaise(posted));
    expect(sumPaise([...posted, entry!])).toBe(0);
  });
});

describe("opening balance", () => {
  it("allows the first one", () => {
    const r = openingEntry([], "r1", 500000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.entry).toEqual({ retailerId: "r1", kind: "opening", amountPaise: 500000 });
  });
  it("blocks a second for the same retailer", () => {
    expect(openingEntry([{ kind: "opening", retailerId: "r1" }], "r1", 100).ok).toBe(false);
  });
  it("allows another retailer", () => {
    expect(openingEntry([{ kind: "opening", retailerId: "r1" }], "r2", 100).ok).toBe(true);
  });
  it("other kinds do not count as opening", () => {
    expect(openingEntry([{ kind: "order_debit", retailerId: "r1" }], "r1", 100).ok).toBe(true);
  });
  it("refuses zero, fractions and huge amounts; allows negative", () => {
    expect(openingEntry([], "r1", 0).ok).toBe(false);
    expect(openingEntry([], "r1", 1.5).ok).toBe(false);
    expect(openingEntry([], "r1", 3_000_000_000).ok).toBe(true);
    expect(openingEntry([], "r1", -MAX_OPENING_PAISE).ok).toBe(true);
    expect(openingEntry([], "r1", MAX_OPENING_PAISE + 1).ok).toBe(false);
    expect(openingEntry([], "r1", -500).ok).toBe(true);
  });
});

describe("canViewLedger", () => {
  const none = { admin: false, accounts: false, sales: false, retailer: false };
  it("staff see all", () => {
    expect(canViewLedger({ ...none, accounts: true }, null, "r1")).toBe(true);
    expect(canViewLedger({ ...none, sales: true }, null, "r1")).toBe(true);
    expect(canViewLedger({ ...none, admin: true }, null, "r1")).toBe(true);
  });
  it("retailer sees only own", () => {
    expect(canViewLedger({ ...none, retailer: true }, "r1", "r1")).toBe(true);
    expect(canViewLedger({ ...none, retailer: true }, "r1", "r2")).toBe(false);
    expect(canViewLedger({ ...none, retailer: true }, null, "r2")).toBe(false);
  });
  it("logistics-only sees nothing", () => expect(canViewLedger(none, null, "r1")).toBe(false));
});
