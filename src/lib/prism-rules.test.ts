import { describe, expect, it } from "vitest";
import {
  adjustmentEntry,
  checkCostPerBag,
  checkEntryDate,
  creditEntry,
  MAX_COST_PER_BAG_PAISE,
  MAX_PRISM_PAISE,
  openingEntry,
  paymentEntry,
  prismBalance,
  prismBalanceLabel,
  prismKindLabel,
  purchaseAmountPaise,
  purchaseEntry,
} from "./prism-rules";

const D = "2026-10-10";

describe("purchaseAmountPaise", () => {
  it("is bags x cost per bag", () => {
    expect(purchaseAmountPaise(100, 35050)).toBe(3_505_000);
    expect(purchaseAmountPaise(1, 1)).toBe(1);
  });
  it("needs whole bags and whole paise, both at least 1", () => {
    expect(purchaseAmountPaise(0, 100)).toBeNull();
    expect(purchaseAmountPaise(-5, 100)).toBeNull();
    expect(purchaseAmountPaise(1.5, 100)).toBeNull();
    expect(purchaseAmountPaise(10, 0)).toBeNull();
    expect(purchaseAmountPaise(10, 99.5)).toBeNull();
    expect(purchaseAmountPaise(10, Number.NaN)).toBeNull();
  });
  it("refuses a total that is not a safe integer or is above the limit", () => {
    expect(purchaseAmountPaise(Number.MAX_SAFE_INTEGER, 2)).toBeNull();
    expect(purchaseAmountPaise(100000, MAX_COST_PER_BAG_PAISE)).toBe(100000 * MAX_COST_PER_BAG_PAISE);
    expect(purchaseAmountPaise(2, MAX_PRISM_PAISE)).toBeNull();
  });
});

describe("checkCostPerBag", () => {
  it("accepts whole paise from 1 up to the limit", () => {
    expect(checkCostPerBag(35000)).toEqual({ ok: true, costPaise: 35000 });
    expect(checkCostPerBag(MAX_COST_PER_BAG_PAISE).ok).toBe(true);
  });
  it("refuses missing, zero, negative, fractional or too high", () => {
    for (const bad of [undefined, null, "350", 0, -1, 10.5, Number.NaN, MAX_COST_PER_BAG_PAISE + 1]) {
      expect(checkCostPerBag(bad).ok).toBe(false);
    }
  });
});

describe("checkEntryDate", () => {
  it("accepts today and earlier days", () => {
    expect(checkEntryDate(D, D)).toEqual({ ok: true, date: D });
    expect(checkEntryDate("2026-01-31", D).ok).toBe(true);
    expect(checkEntryDate(" 2026-10-09 ", D)).toEqual({ ok: true, date: "2026-10-09" });
  });
  it("refuses the future, fake days and other formats", () => {
    expect(checkEntryDate("2026-10-11", D).ok).toBe(false);
    expect(checkEntryDate("2026-02-30", D).ok).toBe(false);
    expect(checkEntryDate("1999-12-31", D).ok).toBe(false);
    for (const bad of ["", "10/10/2026", "2026-1-5", null, undefined, 20261010]) {
      expect(checkEntryDate(bad, D).ok).toBe(false);
    }
  });
});

describe("openingEntry", () => {
  it("keeps the sign: + we owe, - Prism owes us", () => {
    const owe = openingEntry([], 5_000_000, D);
    expect(owe.ok && owe.entry).toMatchObject({ kind: "opening", amountPaise: 5_000_000, entryDate: D });
    const credit = openingEntry([], -200_000, D);
    expect(credit.ok && credit.entry.amountPaise).toBe(-200_000);
  });
  it("is allowed only once", () => {
    const r = openingEntry([{ kind: "purchase" }, { kind: "opening" }], 100, D);
    expect(r).toEqual({ ok: false, error: "Opening balance is already set." });
    expect(openingEntry([{ kind: "purchase" }, { kind: "payment" }], 100, D).ok).toBe(true);
  });
  it("refuses zero, fractions and huge amounts", () => {
    for (const bad of [0, 1.5, Number.NaN, "100", undefined, MAX_PRISM_PAISE + 1, -MAX_PRISM_PAISE - 1]) {
      expect(openingEntry([], bad, D).ok).toBe(false);
    }
    expect(openingEntry([], MAX_PRISM_PAISE, D).ok).toBe(true);
  });
});

describe("purchaseEntry", () => {
  it("is plus bags x cost, with an invoice reference", () => {
    const r = purchaseEntry(200, 31000, D, { reference: "  INV-77 ", description: "200 bags OPC 43" });
    expect(r.ok && r.entry).toEqual({
      kind: "purchase",
      amountPaise: 6_200_000,
      entryDate: D,
      mode: null,
      reference: "INV-77",
      note: "200 bags OPC 43",
    });
  });
  it("has a default note and an empty reference", () => {
    const r = purchaseEntry(10, 35000, D);
    expect(r.ok && r.entry.reference).toBe("");
    expect(r.ok && r.entry.note).toContain("10 bags");
  });
  it("needs a cost per bag", () => {
    expect(purchaseEntry(10, undefined, D)).toEqual({ ok: false, error: "Enter the cost per bag." });
    expect(purchaseEntry(10, 0, D).ok).toBe(false);
  });
  it("refuses bad bags or a total over the limit", () => {
    expect(purchaseEntry(0, 100, D).ok).toBe(false);
    expect(purchaseEntry(2.5, 100, D).ok).toBe(false);
    expect(purchaseEntry(Number.MAX_SAFE_INTEGER, MAX_COST_PER_BAG_PAISE, D).ok).toBe(false);
  });
  it("cuts a very long reference", () => {
    const r = purchaseEntry(1, 100, D, { reference: "x".repeat(200) });
    expect(r.ok && r.entry.reference.length).toBe(60);
  });
});

describe("paymentEntry", () => {
  it("is minus the typed amount", () => {
    const r = paymentEntry(1_000_000, "bank", " utr123 ", D);
    expect(r.ok && r.entry).toMatchObject({ kind: "payment", amountPaise: -1_000_000, mode: "bank", reference: "utr123" });
  });
  it("needs a reference for bank only", () => {
    expect(paymentEntry(100, "bank", "", D)).toEqual({ ok: false, error: "Enter the bank reference (UTR)." });
    expect(paymentEntry(100, "cash", "", D).ok).toBe(true);
    expect(paymentEntry(100, "other", undefined, D).ok).toBe(true);
  });
  it("needs a known mode", () => {
    expect(paymentEntry(100, "cheque", "x", D).ok).toBe(false);
    expect(paymentEntry(100, undefined, "x", D).ok).toBe(false);
  });
  it("refuses zero, negative, fractional and huge amounts and a long reference", () => {
    for (const bad of [0, -100, 1.5, Number.NaN, MAX_PRISM_PAISE + 1]) {
      expect(paymentEntry(bad, "cash", "", D).ok).toBe(false);
    }
    expect(paymentEntry(100, "cash", "x".repeat(61), D).ok).toBe(false);
  });
});

describe("creditEntry", () => {
  it("is minus the amount and keeps the reason as the note", () => {
    const r = creditEntry(25_000, " Festival scheme ", D);
    expect(r.ok && r.entry).toMatchObject({ kind: "credit", amountPaise: -25_000, note: "Festival scheme" });
  });
  it("needs a reason", () => {
    expect(creditEntry(25_000, "", D)).toEqual({ ok: false, error: "Enter the reason." });
    expect(creditEntry(25_000, "   ", D).ok).toBe(false);
    expect(creditEntry(25_000, undefined, D).ok).toBe(false);
  });
  it("refuses zero and negative amounts", () => {
    expect(creditEntry(0, "x", D).ok).toBe(false);
    expect(creditEntry(-5, "x", D).ok).toBe(false);
  });
});

describe("adjustmentEntry", () => {
  it("keeps the sign and needs a reason", () => {
    const up = adjustmentEntry(5000, "Invoice short by 50", D);
    expect(up.ok && up.entry).toMatchObject({ kind: "adjustment", amountPaise: 5000, note: "Invoice short by 50" });
    const down = adjustmentEntry(-5000, "Entered twice", D);
    expect(down.ok && down.entry.amountPaise).toBe(-5000);
    expect(adjustmentEntry(5000, "", D).ok).toBe(false);
  });
  it("is never zero", () => {
    expect(adjustmentEntry(0, "why", D).ok).toBe(false);
  });
  it("refuses a reason over 300 characters", () => {
    expect(adjustmentEntry(100, "x".repeat(301), D).ok).toBe(false);
  });
});

describe("balance", () => {
  it("is the sum of the signed amounts", () => {
    expect(prismBalance([])).toBe(0);
    const entries = [
      openingEntry([], 5_000_000, D),
      purchaseEntry(100, 30000, D),
      paymentEntry(2_000_000, "bank", "U1", D),
      creditEntry(100_000, "Scheme", D),
      adjustmentEntry(-50_000, "Typo", D),
    ].map((r) => (r.ok ? r.entry : { amountPaise: Number.NaN }));
    expect(prismBalance(entries)).toBe(5_000_000 + 3_000_000 - 2_000_000 - 100_000 - 50_000);
  });
  it("is worded for the page", () => {
    expect(prismBalanceLabel(150_000)).toEqual({ text: "You owe Prism", amountPaise: 150_000 });
    expect(prismBalanceLabel(-150_000)).toEqual({ text: "Prism owes you", amountPaise: 150_000 });
    expect(prismBalanceLabel(0)).toEqual({ text: "All settled", amountPaise: 0 });
  });
  it("names every kind", () => {
    expect(prismKindLabel("credit")).toBe("Credit");
    expect(prismKindLabel("opening")).toBe("Opening balance");
    expect(prismKindLabel("other")).toBe("other");
  });
});

describe("signs", () => {
  it("purchase is always +, payment and credit always -", () => {
    const p = purchaseEntry(5, 100, D);
    const pay = paymentEntry(500, "cash", "", D);
    const cr = creditEntry(500, "r", D);
    expect(p.ok && p.entry.amountPaise).toBeGreaterThan(0);
    expect(pay.ok && pay.entry.amountPaise).toBeLessThan(0);
    expect(cr.ok && cr.entry.amountPaise).toBeLessThan(0);
  });
});
