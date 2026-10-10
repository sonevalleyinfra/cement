import { describe, expect, it } from "vitest";
import {
  adjustmentEntry,
  balanceOf,
  canViewLedger,
  dispatchEntry,
  duesFrom,
  MAX_OPENING_PAISE,
  newestFirstWithBalance,
  openingEntry,
  orderDebitPaise,
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
});

describe("dispatch entry", () => {
  const o = { id: "o1", retailerId: "r1" };
  it("bills the bags sent x the rate they were sent at, linked to the order", () => {
    expect(dispatchEntry(o, 40, 35000)).toEqual({
      ok: true,
      entry: { retailerId: "r1", kind: "order_debit", amountPaise: 1400000, orderId: "o1" },
    });
  });
  it("fails without a rate or bags", () => {
    expect(dispatchEntry(o, 10, null).ok).toBe(false);
    expect(dispatchEntry(o, 0, 35000).ok).toBe(false);
  });
  it("one entry per dispatch: a rate change only touches later loads", () => {
    // 100 bags: 40 sent at ₹350, rate changed to ₹360, 60 sent. Nothing else is posted.
    const a = dispatchEntry(o, 40, 35000);
    const b = dispatchEntry(o, 60, 36000);
    if (!a.ok || !b.ok) throw new Error("expected entries");
    expect(sumPaise([a.entry, b.entry])).toBe(40 * 35000 + 60 * 36000);
  });
  it("a cancelled rest posts nothing: dues = only what was sent", () => {
    const a = dispatchEntry(o, 40, 35000);
    if (!a.ok) throw new Error(a.error);
    expect(sumPaise([a.entry])).toBe(1400000);
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

describe("adjustmentEntry", () => {
  it("adds a signed adjustment with its reason as the note", () => {
    expect(adjustmentEntry("R", 5000, " Rounding ")).toEqual({
      ok: true,
      entry: { retailerId: "R", kind: "adjustment", amountPaise: 5000 },
      note: "Rounding",
    });
    expect(adjustmentEntry("R", -5000, "Cash reversed after handover")).toMatchObject({
      ok: true,
      entry: { amountPaise: -5000 },
    });
  });
  it("needs a reason", () => {
    expect(adjustmentEntry("R", 5000, "")).toEqual({ ok: false, error: "Enter the reason." });
    expect(adjustmentEntry("R", 5000, undefined).ok).toBe(false);
  });
  it("refuses zero, fractions and huge amounts", () => {
    for (const n of [0, 1.5, Number.NaN, MAX_OPENING_PAISE + 1, -MAX_OPENING_PAISE - 1]) {
      expect(adjustmentEntry("R", n, "x").ok).toBe(false);
    }
  });
});

describe("newestFirstWithBalance", () => {
  it("shows the newest row first, each with its own balance after it", () => {
    const rows = [
      { id: "a", amountPaise: 100 },
      { id: "b", amountPaise: -30 },
      { id: "c", amountPaise: 50 },
    ];
    expect(newestFirstWithBalance(rows)).toEqual([
      { id: "c", amountPaise: 50, balancePaise: 120 },
      { id: "b", amountPaise: -30, balancePaise: 70 },
      { id: "a", amountPaise: 100, balancePaise: 100 },
    ]);
  });
  it("the top row's balance is the balance now; empty stays empty", () => {
    expect(newestFirstWithBalance([{ amountPaise: 5 }, { amountPaise: 7 }])[0].balancePaise).toBe(12);
    expect(newestFirstWithBalance([])).toEqual([]);
  });
});
