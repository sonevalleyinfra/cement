import { describe, expect, it } from "vitest";
import {
  adjustmentEntry,
  checkCostPerBag,
  checkEntryDate,
  creditEntry,
  MAX_COST_PER_BAG_PAISE,
  balancesByBrand,
  MAX_SUPPLIER_PAISE,
  openingEntry,
  paymentEntry,
  purchaseAmountPaise,
  purchaseEntry,
  supplierBalance,
  supplierBalanceLabel,
  supplierKindLabel,
  supplierHomeLines,
  suppliersToShow,
} from "./supplier-rules";

const D = "2026-10-10";
/** Brand ids: Prism and UltraTech. */
const P = "b-prism";
const U = "b-ultra";
const prismProduct = { brandId: P };

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
    expect(purchaseAmountPaise(2, MAX_SUPPLIER_PAISE)).toBeNull();
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
  it("keeps the sign: + we owe, - the supplier owes us", () => {
    const owe = openingEntry([], P, 5_000_000, D);
    expect(owe.ok && owe.entry).toMatchObject({ brandId: P, kind: "opening", amountPaise: 5_000_000, entryDate: D });
    const credit = openingEntry([], P, -200_000, D);
    expect(credit.ok && credit.entry.amountPaise).toBe(-200_000);
  });
  it("is allowed only once per brand", () => {
    const existing = [
      { brandId: P, kind: "purchase" },
      { brandId: P, kind: "opening" },
    ];
    expect(openingEntry(existing, P, 100, D)).toEqual({ ok: false, error: "Opening balance is already set." });
    expect(openingEntry([{ brandId: P, kind: "purchase" }, { brandId: P, kind: "payment" }], P, 100, D).ok).toBe(true);
  });
  it("another brand may still set its own opening", () => {
    const r = openingEntry([{ brandId: P, kind: "opening" }], U, 100, D);
    expect(r.ok && r.entry).toMatchObject({ brandId: U, kind: "opening", amountPaise: 100 });
  });
  it("needs a brand", () => {
    for (const bad of ["", "  ", undefined, null, 5]) {
      expect(openingEntry([], bad, 100, D)).toEqual({ ok: false, error: "Pick a brand." });
    }
  });
  it("refuses zero, fractions and huge amounts", () => {
    for (const bad of [0, 1.5, Number.NaN, "100", undefined, MAX_SUPPLIER_PAISE + 1, -MAX_SUPPLIER_PAISE - 1]) {
      expect(openingEntry([], P, bad, D).ok).toBe(false);
    }
    expect(openingEntry([], P, MAX_SUPPLIER_PAISE, D).ok).toBe(true);
  });
});

describe("purchaseEntry", () => {
  it("is plus bags x cost, with an invoice reference", () => {
    const r = purchaseEntry(prismProduct, 200, 31000, D, { reference: "  INV-77 ", description: "200 bags OPC 43" });
    expect(r.ok && r.entry).toEqual({
      brandId: P,
      kind: "purchase",
      amountPaise: 6_200_000,
      entryDate: D,
      mode: null,
      reference: "INV-77",
      note: "200 bags OPC 43",
    });
  });
  it("goes to the account of the purchased product's brand", () => {
    const ultra = purchaseEntry({ brandId: U }, 10, 40000, D);
    expect(ultra.ok && ultra.entry.brandId).toBe(U);
    const prism = purchaseEntry({ brandId: P }, 10, 40000, D);
    expect(prism.ok && prism.entry.brandId).toBe(P);
  });
  it("needs the product's brand", () => {
    expect(purchaseEntry({ brandId: "" }, 10, 40000, D)).toEqual({ ok: false, error: "Pick a brand." });
  });
  it("has a default note and an empty reference", () => {
    const r = purchaseEntry(prismProduct, 10, 35000, D);
    expect(r.ok && r.entry.reference).toBe("");
    expect(r.ok && r.entry.note).toContain("10 bags");
  });
  it("needs a cost per bag", () => {
    expect(purchaseEntry(prismProduct, 10, undefined, D)).toEqual({ ok: false, error: "Enter the cost per bag." });
    expect(purchaseEntry(prismProduct, 10, 0, D).ok).toBe(false);
  });
  it("refuses bad bags or a total over the limit", () => {
    expect(purchaseEntry(prismProduct, 0, 100, D).ok).toBe(false);
    expect(purchaseEntry(prismProduct, 2.5, 100, D).ok).toBe(false);
    expect(purchaseEntry(prismProduct, Number.MAX_SAFE_INTEGER, MAX_COST_PER_BAG_PAISE, D).ok).toBe(false);
  });
  it("cuts a very long reference", () => {
    const r = purchaseEntry(prismProduct, 1, 100, D, { reference: "x".repeat(200) });
    expect(r.ok && r.entry.reference.length).toBe(60);
  });
});

describe("paymentEntry", () => {
  it("is minus the typed amount, on the picked brand", () => {
    const r = paymentEntry(P, 1_000_000, "bank", " utr123 ", D);
    expect(r.ok && r.entry).toMatchObject({ brandId: P, kind: "payment", amountPaise: -1_000_000, mode: "bank", reference: "utr123" });
  });
  it("needs a reference for bank only", () => {
    expect(paymentEntry(P, 100, "bank", "", D)).toEqual({ ok: false, error: "Enter the bank reference (UTR)." });
    expect(paymentEntry(P, 100, "cash", "", D).ok).toBe(true);
    expect(paymentEntry(P, 100, "other", undefined, D).ok).toBe(true);
  });
  it("needs a brand", () => {
    expect(paymentEntry("", 100, "cash", "", D)).toEqual({ ok: false, error: "Pick a brand." });
    expect(creditEntry(undefined, 100, "r", D).ok).toBe(false);
    expect(adjustmentEntry(null, 100, "r", D).ok).toBe(false);
  });
  it("needs a known mode", () => {
    expect(paymentEntry(P, 100, "cheque", "x", D).ok).toBe(false);
    expect(paymentEntry(P, 100, undefined, "x", D).ok).toBe(false);
  });
  it("refuses zero, negative, fractional and huge amounts and a long reference", () => {
    for (const bad of [0, -100, 1.5, Number.NaN, MAX_SUPPLIER_PAISE + 1]) {
      expect(paymentEntry(P, bad, "cash", "", D).ok).toBe(false);
    }
    expect(paymentEntry(P, 100, "cash", "x".repeat(61), D).ok).toBe(false);
  });
});

describe("creditEntry", () => {
  it("is minus the amount and keeps the reason as the note", () => {
    const r = creditEntry(P, 25_000, " Festival scheme ", D);
    expect(r.ok && r.entry).toMatchObject({ kind: "credit", amountPaise: -25_000, note: "Festival scheme" });
  });
  it("needs a reason", () => {
    expect(creditEntry(P, 25_000, "", D)).toEqual({ ok: false, error: "Enter the reason." });
    expect(creditEntry(P, 25_000, "   ", D).ok).toBe(false);
    expect(creditEntry(P, 25_000, undefined, D).ok).toBe(false);
  });
  it("refuses zero and negative amounts", () => {
    expect(creditEntry(P, 0, "x", D).ok).toBe(false);
    expect(creditEntry(P, -5, "x", D).ok).toBe(false);
  });
});

describe("adjustmentEntry", () => {
  it("keeps the sign and needs a reason", () => {
    const up = adjustmentEntry(P, 5000, "Invoice short by 50", D);
    expect(up.ok && up.entry).toMatchObject({ kind: "adjustment", amountPaise: 5000, note: "Invoice short by 50" });
    const down = adjustmentEntry(P, -5000, "Entered twice", D);
    expect(down.ok && down.entry.amountPaise).toBe(-5000);
    expect(adjustmentEntry(P, 5000, "", D).ok).toBe(false);
  });
  it("is never zero", () => {
    expect(adjustmentEntry(P, 0, "why", D).ok).toBe(false);
  });
  it("refuses a reason over 300 characters", () => {
    expect(adjustmentEntry(P, 100, "x".repeat(301), D).ok).toBe(false);
  });
});

describe("balance", () => {
  const entries = [
    openingEntry([], P, 5_000_000, D),
    purchaseEntry(prismProduct, 100, 30000, D),
    paymentEntry(P, 2_000_000, "bank", "U1", D),
    creditEntry(P, 100_000, "Scheme", D),
    adjustmentEntry(P, -50_000, "Typo", D),
    openingEntry([], U, 1_000_000, D),
    purchaseEntry({ brandId: U }, 10, 40000, D),
    paymentEntry(U, 300_000, "cash", "", D),
  ].map((r) => (r.ok ? r.entry : { brandId: "?", amountPaise: Number.NaN }));

  it("is the sum of one brand's signed amounts", () => {
    expect(supplierBalance([], P)).toBe(0);
    expect(supplierBalance(entries, P)).toBe(5_000_000 + 3_000_000 - 2_000_000 - 100_000 - 50_000);
    expect(supplierBalance(entries, U)).toBe(1_000_000 + 400_000 - 300_000);
    expect(supplierBalance(entries, "nobody")).toBe(0);
  });
  it("a payment to one brand never changes another brand's balance", () => {
    const before = supplierBalance(entries, P);
    const pay = paymentEntry(U, 50_000, "cash", "", D);
    const after = [...entries, ...(pay.ok ? [pay.entry] : [])];
    expect(supplierBalance(after, P)).toBe(before);
    expect(supplierBalance(after, U)).toBe(supplierBalance(entries, U) - 50_000);
  });
  it("balancesByBrand adds up every brand at once, and they total the whole ledger", () => {
    const map = balancesByBrand(entries);
    expect(map.get(P)).toBe(supplierBalance(entries, P));
    expect(map.get(U)).toBe(supplierBalance(entries, U));
    expect([...map.values()].reduce((a, b) => a + b, 0)).toBe(entries.reduce((a, e) => a + e.amountPaise, 0));
  });
  it("is worded for the page with the brand name", () => {
    expect(supplierBalanceLabel("Prism", 150_000)).toEqual({ text: "You owe Prism", amountPaise: 150_000 });
    expect(supplierBalanceLabel("UltraTech", -150_000)).toEqual({ text: "UltraTech owes you", amountPaise: 150_000 });
    expect(supplierBalanceLabel("Prism", 0)).toEqual({ text: "Prism settled", amountPaise: 0 });
  });
  it("names every kind", () => {
    expect(supplierKindLabel("credit")).toBe("Credit");
    expect(supplierKindLabel("opening")).toBe("Opening balance");
    expect(supplierKindLabel("other")).toBe("other");
  });
});

describe("supplierHomeLines", () => {
  it("one line per supplier, up to three", () => {
    expect(supplierHomeLines([])).toEqual([]);
    expect(
      supplierHomeLines([
        { name: "Prism", balancePaise: 500_000 },
        { name: "UltraTech", balancePaise: -2_000 },
      ]),
    ).toEqual([
      { text: "You owe Prism", amountPaise: 500_000 },
      { text: "UltraTech owes you", amountPaise: 2_000 },
    ]);
  });
  it("with more than three, one total line", () => {
    const four = [100, 200, 300, -50].map((p, i) => ({ name: `B${i}`, balancePaise: p }));
    expect(supplierHomeLines(four)).toEqual([{ text: "You owe suppliers", amountPaise: 550 }]);
    expect(supplierHomeLines(four.map((r) => ({ ...r, balancePaise: -r.balancePaise })))).toEqual([
      { text: "Suppliers owe you", amountPaise: 550 },
    ]);
    expect(supplierHomeLines(four.map((r) => ({ ...r, balancePaise: 0 })))).toEqual([{ text: "All settled", amountPaise: 0 }]);
  });
});

describe("suppliersToShow", () => {
  const brands = [
    { id: U, name: "UltraTech", active: true },
    { id: P, name: "Prism", active: true },
    { id: "b-old", name: "Old Brand", active: false },
    { id: "b-gone", name: "Gone", active: false },
  ];
  it("lists switched-on brands and switched-off ones that still have entries, by name", () => {
    const rows = suppliersToShow(brands, [
      { brandId: P, balancePaise: 500, entries: 3 },
      { brandId: "b-old", balancePaise: 0, entries: 2 },
    ]);
    expect(rows.map((r) => [r.name, r.balancePaise])).toEqual([
      ["Old Brand", 0],
      ["Prism", 500],
      ["UltraTech", 0],
    ]);
  });
});

describe("signs", () => {
  it("purchase is always +, payment and credit always -", () => {
    const p = purchaseEntry(prismProduct, 5, 100, D);
    const pay = paymentEntry(P, 500, "cash", "", D);
    const cr = creditEntry(P, 500, "r", D);
    expect(p.ok && p.entry.amountPaise).toBeGreaterThan(0);
    expect(pay.ok && pay.entry.amountPaise).toBeLessThan(0);
    expect(cr.ok && cr.entry.amountPaise).toBeLessThan(0);
  });
});
