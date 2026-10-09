import { describe, expect, it } from "vitest";
import {
  balanceAcrossFirms,
  balanceForFirm,
  balancesByFirm,
  canViewLedger,
  cancelReversalEntry,
  duesFrom,
  MAX_OPENING_PAISE,
  openingEntry,
  orderDebitEntry,
  orderDebitPaise,
  rateChangeEntry,
  summariseDues,
  withRunningBalance,
} from "./ledger-rules";

const e = (retailerId: string, firmId: string, amountPaise: number, orderId?: string) => ({
  retailerId,
  firmId,
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

describe("balances", () => {
  const rows = [e("r1", "A", 1000), e("r1", "B", 500), e("r1", "A", -200), e("r2", "A", 9999)];
  it("per firm", () => {
    expect(balanceForFirm(rows, "r1", "A")).toBe(800);
    expect(balanceForFirm(rows, "r1", "B")).toBe(500);
    expect(balanceForFirm(rows, "r1", "C")).toBe(0);
  });
  it("across firms", () => expect(balanceAcrossFirms(rows, "r1")).toBe(1300));
  it("by firm map", () => expect(balancesByFirm(rows, "r1")).toEqual({ A: 800, B: 500 }));
  it("never mixes retailers", () => expect(balanceAcrossFirms(rows, "r2")).toBe(9999));
});

describe("dues", () => {
  it("advance is not negative dues", () => {
    expect(duesFrom(-100)).toBe(0);
    expect(duesFrom(250)).toBe(250);
  });
  it("summary with firm and across firms", () => {
    const rows = [e("r1", "A", 6000000), e("r1", "B", 7000000), e("r1", "B", -3000000)];
    expect(summariseDues(rows, "r1", "A")).toEqual({
      withFirmPaise: 6000000,
      allFirmsPaise: 10000000,
      netAllFirmsPaise: 10000000,
    });
    expect(summariseDues(rows, "r1", "B").withFirmPaise).toBe(4000000);
  });
  it("an advance with one firm does not reduce dues with another", () => {
    const rows = [e("r1", "A", 1000), e("r1", "B", -400)];
    const s = summariseDues(rows, "r1", "A");
    expect(s.allFirmsPaise).toBe(1000);
    expect(s.netAllFirmsPaise).toBe(600);
    expect(summariseDues(rows, "r1", "B").withFirmPaise).toBe(0);
  });
  it("is zero with no entries", () =>
    expect(summariseDues([], "r1", "A")).toEqual({ withFirmPaise: 0, allFirmsPaise: 0, netAllFirmsPaise: 0 }));
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
    const r = orderDebitEntry({ id: "o1", firmId: "A", retailerId: "r1", bags: 10, ratePaise: 40000 });
    expect(r).toEqual({
      ok: true,
      entry: { firmId: "A", retailerId: "r1", kind: "order_debit", amountPaise: 400000, orderId: "o1" },
    });
  });
  it("fails without a rate", () =>
    expect(orderDebitEntry({ id: "o1", firmId: "A", retailerId: "r1", bags: 10, ratePaise: null }).ok).toBe(false));
});

describe("rate change", () => {
  const o = { id: "o1", firmId: "A", retailerId: "r1", bags: 10 };
  it("adds the difference", () => {
    expect(rateChangeEntry(o, 40000, 41000)?.amountPaise).toBe(10000);
    expect(rateChangeEntry(o, 40000, 39000)?.amountPaise).toBe(-10000);
    expect(rateChangeEntry(o, 40000, 41000)?.kind).toBe("adjustment");
  });
  it("adds nothing when unchanged", () => expect(rateChangeEntry(o, 40000, 40000)).toBeNull());
});

describe("cancel reversal", () => {
  const o = { id: "o1", firmId: "A", retailerId: "r1" };
  it("cancels the debit", () => {
    const r = cancelReversalEntry(o, [e("r1", "A", 400000, "o1")]);
    expect(r?.amountPaise).toBe(-400000);
    expect(r?.orderId).toBe("o1");
  });
  it("includes rate adjustments so the order nets to zero", () => {
    const posted = [e("r1", "A", 400000, "o1"), e("r1", "A", 10000, "o1")];
    expect(cancelReversalEntry(o, posted)?.amountPaise).toBe(-410000);
  });
  it("ignores other orders", () => {
    expect(cancelReversalEntry(o, [e("r1", "A", 500, "o2")])).toBeNull();
  });
  it("does nothing when nothing posted or already reversed", () => {
    expect(cancelReversalEntry(o, [])).toBeNull();
    expect(cancelReversalEntry(o, [e("r1", "A", 100, "o1"), e("r1", "A", -100, "o1")])).toBeNull();
  });
});

describe("opening balance", () => {
  it("allows the first one", () => {
    const r = openingEntry([], "r1", "A", 500000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.entry.kind).toBe("opening");
  });
  it("blocks a second for the same retailer and firm", () => {
    expect(openingEntry([{ kind: "opening", firmId: "A", retailerId: "r1" }], "r1", "A", 100).ok).toBe(false);
  });
  it("allows another firm or another retailer", () => {
    const ex = [{ kind: "opening", firmId: "A", retailerId: "r1" }];
    expect(openingEntry(ex, "r1", "B", 100).ok).toBe(true);
    expect(openingEntry(ex, "r2", "A", 100).ok).toBe(true);
  });
  it("other kinds do not count as opening", () => {
    expect(openingEntry([{ kind: "order_debit", firmId: "A", retailerId: "r1" }], "r1", "A", 100).ok).toBe(true);
  });
  it("refuses zero, fractions and huge amounts; allows negative", () => {
    expect(openingEntry([], "r1", "A", 0).ok).toBe(false);
    expect(openingEntry([], "r1", "A", 1.5).ok).toBe(false);
    expect(openingEntry([], "r1", "A", 3_000_000_000).ok).toBe(true);
    expect(openingEntry([], "r1", "A", -MAX_OPENING_PAISE).ok).toBe(true);
    expect(openingEntry([], "r1", "A", MAX_OPENING_PAISE + 1).ok).toBe(false);
    expect(openingEntry([], "r1", "A", -500).ok).toBe(true);
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
