import { describe, expect, it } from "vitest";
import {
  bagsToKg,
  canSwitchOffProduct,
  cleanListName,
  cleanTypeCode,
  formatTonnes,
  isDuplicateName,
  productGroups,
  productName,
  validateNewProduct,
  type CatalogueLookups,
} from "./catalogue-rules";

describe("productName", () => {
  it("joins brand, channel, type and grade", () => {
    expect(productName({ brand: "Prism", channel: "trade", typeCode: "OPC", grade: "53", bagKg: 50 })).toBe(
      "Prism Trade OPC 53",
    );
    expect(productName({ brand: "Prism", channel: "non_trade", typeCode: "PPC", grade: "43", bagKg: 50 })).toBe(
      "Prism Non-trade PPC 43",
    );
  });
  it("adds the bag size only when it is not 50 kg", () => {
    expect(productName({ brand: "Prism", channel: "trade", typeCode: "PPC", grade: "33", bagKg: 25 })).toBe(
      "Prism Trade PPC 33 25kg",
    );
  });
});

describe("cleanListName", () => {
  it("trims and joins spaces", () => expect(cleanListName("  Prism   Cement ")).toBe("Prism Cement"));
  it("is null when empty", () => expect(cleanListName("   ")).toBeNull());
  it("cuts long names", () => expect(cleanListName("x".repeat(50), 40)).toHaveLength(40));
});

describe("cleanTypeCode", () => {
  it("uppercases and drops other characters", () => expect(cleanTypeCode(" p.s.c ")).toBe("PSC"));
  it("needs 2 to 10 characters", () => {
    expect(cleanTypeCode("P")).toBeNull();
    expect(cleanTypeCode("ABCDEFGHIJK")).toBeNull();
  });
});

describe("isDuplicateName", () => {
  it("ignores capitals and extra spaces", () => {
    expect(isDuplicateName("prism  ", ["Prism"])).toBe(true);
    expect(isDuplicateName("Main  Godown", ["main godown"])).toBe(true);
    expect(isDuplicateName("UltraTech", ["Prism"])).toBe(false);
  });
});

describe("validateNewProduct", () => {
  const lookups: CatalogueLookups = {
    brands: [
      { id: "b1", name: "Prism", active: true },
      { id: "b2", name: "Old", active: false },
    ],
    types: [
      { id: "opc", code: "OPC", active: true },
      { id: "ppc", code: "PPC", active: true },
      { id: "psc", code: "PSC", active: false },
    ],
    grades: [
      { id: "opc53", typeId: "opc", name: "53", active: true },
      { id: "ppc43", typeId: "ppc", name: "43", active: true },
      { id: "ppc33", typeId: "ppc", name: "33", active: false },
    ],
    products: [{ brandId: "b1", channel: "trade", gradeId: "opc53", bagKg: 50 }],
  };
  const good = { brandId: "b1", channel: "non_trade", typeId: "ppc", gradeId: "ppc43", bagKg: 50 };

  it("builds the product and its name", () => {
    expect(validateNewProduct(good, lookups)).toEqual({
      ok: true,
      value: { brandId: "b1", channel: "non_trade", gradeId: "ppc43", bagKg: 50, name: "Prism Non-trade PPC 43" },
    });
  });
  it("refuses a duplicate", () => {
    const res = validateNewProduct({ ...good, channel: "trade", typeId: "opc", gradeId: "opc53" }, lookups);
    expect(res).toEqual({ ok: false, error: "This product already exists." });
  });
  it("allows the same grade in the other channel", () => {
    expect(validateNewProduct({ ...good, typeId: "opc", gradeId: "opc53" }, lookups).ok).toBe(true);
  });
  it("refuses a grade from another type", () => {
    expect(validateNewProduct({ ...good, typeId: "opc", gradeId: "ppc43" }, lookups)).toEqual({
      ok: false,
      error: "Pick a grade.",
    });
  });
  it("refuses switched-off or unknown items", () => {
    expect(validateNewProduct({ ...good, brandId: "b2" }, lookups).ok).toBe(false);
    expect(validateNewProduct({ ...good, brandId: "nope" }, lookups).ok).toBe(false);
    expect(validateNewProduct({ ...good, typeId: "psc" }, lookups).ok).toBe(false);
    expect(validateNewProduct({ ...good, gradeId: "ppc33" }, lookups).ok).toBe(false);
  });
  it("refuses an unknown channel or bag size", () => {
    expect(validateNewProduct({ ...good, channel: "retail" }, lookups)).toEqual({
      ok: false,
      error: "Pick trade or non-trade.",
    });
    expect(validateNewProduct({ ...good, bagKg: 45 }, lookups)).toEqual({ ok: false, error: "Pick a bag size." });
  });
});

describe("weight", () => {
  it("multiplies bags by kg per bag", () => expect(bagsToKg(20, 50)).toBe(1000));
  it("shows tonnes", () => {
    expect(formatTonnes(1000)).toBe("1 MT");
    expect(formatTonnes(1250)).toBe("1.25 MT");
    expect(formatTonnes(bagsToKg(2010, 50))).toBe("100.5 MT");
  });
  it("uses Indian digit grouping", () => expect(formatTonnes(bagsToKg(2_000_000, 50))).toBe("1,00,000 MT"));
});

describe("productGroups", () => {
  it("puts trade first, keeps order and drops empty sections", () => {
    const groups = productGroups([
      { id: "3", name: "Prism Non-trade PPC 53", channel: "non_trade" },
      { id: "1", name: "Prism Trade OPC 43", channel: "trade" },
      { id: "2", name: "Prism Trade OPC 53", channel: "trade" },
    ]);
    expect(groups).toEqual([
      {
        label: "Trade",
        options: [
          { value: "1", label: "Prism Trade OPC 43" },
          { value: "2", label: "Prism Trade OPC 53" },
        ],
      },
      { label: "Non-trade", options: [{ value: "3", label: "Prism Non-trade PPC 53" }] },
    ]);
    expect(productGroups([{ id: "1", name: "A", channel: "trade" }])).toHaveLength(1);
  });
});

describe("canSwitchOffProduct", () => {
  it("refuses while bags are in stock", () => {
    expect(canSwitchOffProduct(5)).toEqual({ ok: false, error: "Bags still in stock." });
    expect(canSwitchOffProduct(0)).toEqual({ ok: true });
  });
});
