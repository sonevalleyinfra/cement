import { describe, expect, it } from "vitest";
import {
  bagsToKg,
  canSwitchOffBrand,
  canSwitchOnProduct,
  hasManyBrands,
  startBrand,
  canSwitchOffProduct,
  cleanListName,
  cleanTypeCode,
  findProductByParts,
  formatTonnes,
  isDuplicateName,
  productGroups,
  productName,
  listsUsedBy,
  renamedProducts,
  pickProductParts,
  resolveProduct,
  shortProductName,
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

  it("builds the product and its name, with the picked brand", () => {
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
  it("the same parts under another brand are a new product", () => {
    const withUltra = { ...lookups, brands: [...lookups.brands, { id: "b3", name: "UltraTech", active: true }] };
    expect(validateNewProduct({ ...good, brandId: "b3", channel: "trade", typeId: "opc", gradeId: "opc53" }, withUltra)).toEqual({
      ok: true,
      value: { brandId: "b3", channel: "trade", gradeId: "opc53", bagKg: 50, name: "UltraTech Trade OPC 53" },
    });
  });
  it("refuses switched-off or unknown items", () => {
    expect(validateNewProduct({ ...good, brandId: "b2" }, lookups)).toEqual({ ok: false, error: "Pick a brand." });
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
  it("with one brand, sections stay Trade / Non-trade", () => {
    const groups = productGroups([
      { id: "1", name: "Prism Trade OPC 43", channel: "trade", brand: "Prism" },
      { id: "3", name: "Prism Non-trade PPC 53", channel: "non_trade", brand: "Prism" },
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Trade", "Non-trade"]);
  });
  it("with more than one brand, each brand gets its own sections", () => {
    const groups = productGroups([
      { id: "1", name: "Prism Trade OPC 43", channel: "trade", brand: "Prism" },
      { id: "3", name: "Prism Non-trade PPC 53", channel: "non_trade", brand: "Prism" },
      { id: "9", name: "UltraTech Trade OPC 53", channel: "trade", brand: "UltraTech" },
    ]);
    expect(groups.map((g) => [g.label, g.options.map((o) => o.value)])).toEqual([
      ["Prism · Trade", ["1"]],
      ["Prism · Non-trade", ["3"]],
      ["UltraTech · Trade", ["9"]],
    ]);
  });
});

describe("hasManyBrands / startBrand", () => {
  it("asks for a brand only when there is more than one", () => {
    expect(hasManyBrands([])).toBe(false);
    expect(hasManyBrands([{ id: "b1" }])).toBe(false);
    expect(hasManyBrands([{ id: "b1" }, { id: "b2" }])).toBe(true);
  });
  it("starts on the brand picked before, else the first", () => {
    const brands = [{ id: "b1" }, { id: "b2" }];
    expect(startBrand(brands, "b2")).toBe("b2");
    expect(startBrand(brands, "gone")).toBe("b1");
    expect(startBrand(brands)).toBe("b1");
    expect(startBrand([], "b1")).toBe("");
  });
});

describe("canSwitchOffBrand", () => {
  it("refuses while any of its bags are in stock", () => {
    expect(canSwitchOffBrand({ activeProducts: 0, bagsInStock: 10 })).toEqual({ ok: false, error: "Bags still in stock." });
    expect(canSwitchOffBrand({ activeProducts: 2, bagsInStock: 10 })).toEqual({ ok: false, error: "Bags still in stock." });
  });
  it("refuses while any of its products are switched on", () => {
    expect(canSwitchOffBrand({ activeProducts: 1, bagsInStock: 0 })).toEqual({ ok: false, error: "Switch its products off first." });
  });
  it("allows it with no switched-on products and no stock", () => {
    expect(canSwitchOffBrand({ activeProducts: 0, bagsInStock: 0 })).toEqual({ ok: true });
  });
});

describe("canSwitchOnProduct", () => {
  it("needs its brand switched on", () => {
    expect(canSwitchOnProduct(true)).toEqual({ ok: true });
    expect(canSwitchOnProduct(false)).toEqual({ ok: false, error: "Switch its brand on first." });
  });
});

describe("canSwitchOffProduct", () => {
  it("refuses while bags are in stock", () => {
    expect(canSwitchOffProduct(5)).toEqual({ ok: false, error: "Bags still in stock." });
    expect(canSwitchOffProduct(0)).toEqual({ ok: true });
  });
});

describe("findProductByParts", () => {
  const products = [
    { id: "p1", brandId: "b1", channel: "trade", gradeId: "g1", bagKg: 50 },
    { id: "p2", brandId: "b1", channel: "non_trade", gradeId: "g1", bagKg: 50 },
    { id: "p3", brandId: "b2", channel: "trade", gradeId: "g1", bagKg: 50 },
  ];
  it("matches brand, trade-type, grade and bag size", () => {
    expect(findProductByParts(products, { brandId: "b1", channel: "non_trade", gradeId: "g1", bagKg: 50 })?.id).toBe("p2");
    expect(findProductByParts(products, { brandId: "b2", channel: "trade", gradeId: "g1", bagKg: 50 })?.id).toBe("p3");
    expect(findProductByParts(products, { brandId: "b2", channel: "non_trade", gradeId: "g1", bagKg: 50 })).toBeUndefined();
    expect(findProductByParts(products, { brandId: "b1", channel: "trade", gradeId: "g2", bagKg: 50 })).toBeUndefined();
  });
});

describe("resolveProduct", () => {
  const lookups = {
    grades: [
      { id: "opc53", typeId: "opc" },
      { id: "ppc43", typeId: "ppc" },
    ],
    products: [
      { id: "p1", brandId: "b1", channel: "trade", gradeId: "opc53", bagKg: 50, active: true },
      { id: "p2", brandId: "b1", channel: "non_trade", gradeId: "opc53", bagKg: 50, active: false },
      { id: "p3", brandId: "b2", channel: "trade", gradeId: "ppc43", bagKg: 50, active: true },
    ],
  };
  const pick = (over: Partial<{ brandId: string; channel: string; typeId: string; gradeId: string }>) => ({
    brandId: "b1",
    channel: "trade",
    typeId: "opc",
    gradeId: "opc53",
    bagKg: 50,
    ...over,
  });

  it("uses an active product as it is", () => {
    expect(resolveProduct(pick({}), lookups)).toEqual({ ok: true, id: "p1" });
    expect(resolveProduct(pick({ brandId: "b2", typeId: "ppc", gradeId: "ppc43" }), lookups)).toEqual({ ok: true, id: "p3" });
  });
  it("never makes a product: a missing one is refused (Catalogue adds products)", () => {
    expect(resolveProduct(pick({ channel: "non_trade", typeId: "ppc", gradeId: "ppc43" }), lookups)).toEqual({
      ok: false,
      error: "Not in catalogue. Add the product in Catalogue first.",
    });
    // Switching brand with the old picks left over does not quietly make "UltraTech Trade OPC 53".
    expect(resolveProduct(pick({ brandId: "b3" }), lookups).ok).toBe(false);
  });
  it("refuses a switched-off product", () => {
    expect(resolveProduct(pick({ channel: "non_trade" }), lookups)).toEqual({ ok: false, error: "Pick an active product." });
  });
  it("refuses a grade from another type", () => {
    expect(resolveProduct(pick({ typeId: "ppc" }), lookups)).toEqual({ ok: false, error: "Pick a grade." });
    expect(resolveProduct(pick({ gradeId: "nope" }), lookups)).toEqual({ ok: false, error: "Pick a grade." });
  });
});

describe("pickProductParts", () => {
  const types = [{ id: "opc" }, { id: "ppc" }];
  const grades = [
    { id: "opc43", typeId: "opc" },
    { id: "opc53", typeId: "opc" },
    { id: "ppc43", typeId: "ppc" },
  ];
  const products = [
    { id: "prism-t-opc53", brandId: "prism", channel: "trade", gradeId: "opc53", bagKg: 50 },
    { id: "prism-t-ppc43", brandId: "prism", channel: "trade", gradeId: "ppc43", bagKg: 50 },
    { id: "prism-n-opc43", brandId: "prism", channel: "non_trade", gradeId: "opc43", bagKg: 50 },
    { id: "ultra-n-ppc43", brandId: "ultra", channel: "non_trade", gradeId: "ppc43", bagKg: 50 },
  ];
  const at = (pick: Partial<{ brandId: string; channel: string; typeId: string; gradeId: string }>) =>
    pickProductParts(products, types, grades, { brandId: "prism", channel: "", typeId: "", gradeId: "", ...pick });

  it("offers only what the brand's products are made of, step by step", () => {
    const r = at({});
    expect(r.channels).toEqual(["trade", "non_trade"]);
    expect(r.typeIds).toEqual(["opc", "ppc"]);
    expect(r.gradeIds).toEqual(["opc53"]);
    expect(r.product?.id).toBe("prism-t-opc53");
    expect(at({ channel: "non_trade" }).typeIds).toEqual(["opc"]);
  });
  it("switching brand resets the pickers to that brand's products (no new product appears)", () => {
    const r = at({ brandId: "ultra", channel: "trade", typeId: "opc", gradeId: "opc53" });
    expect(r).toMatchObject({ channel: "non_trade", typeId: "ppc", gradeId: "ppc43" });
    expect(r.product?.id).toBe("ultra-n-ppc43");
  });
  it("always lands on an existing product of the picked brand, whatever was picked before", () => {
    for (const brandId of ["prism", "ultra"])
      for (const channel of ["", "trade", "non_trade", "x"])
        for (const typeId of ["", "opc", "ppc"])
          for (const gradeId of ["", "opc43", "opc53", "ppc43"]) {
            const r = at({ brandId, channel, typeId, gradeId });
            expect(r.product).not.toBeNull();
            expect(r.product?.brandId).toBe(brandId);
            expect(r.product).toMatchObject({ channel: r.channel, gradeId: r.gradeId });
          }
  });
  it("a valid pick is kept", () => {
    expect(at({ channel: "trade", typeId: "ppc", gradeId: "ppc43" }).product?.id).toBe("prism-t-ppc43");
  });
  it("a brand with no products offers nothing", () => {
    const r = at({ brandId: "empty" });
    expect(r).toMatchObject({ channels: [], typeIds: [], gradeIds: [], product: null });
  });
});

describe("listsUsedBy", () => {
  it("keeps only the brands, types and grades the products use", () => {
    const lists = {
      brands: [{ id: "b1" }, { id: "b2" }],
      types: [{ id: "opc" }, { id: "ppc" }],
      grades: [
        { id: "opc53", typeId: "opc" },
        { id: "opc43", typeId: "opc" },
        { id: "ppc43", typeId: "ppc" },
      ],
    };
    expect(listsUsedBy(lists, [{ brandId: "b1", gradeId: "opc53" }])).toEqual({
      brands: [{ id: "b1" }],
      types: [{ id: "opc" }],
      grades: [{ id: "opc53", typeId: "opc" }],
    });
  });
});

describe("renamedProducts", () => {
  it("rebuilds names and returns only the ones that changed", () => {
    const rows = [
      { id: "p1", name: "Prism Trade OPC 53", brand: "Prisma", channel: "trade", typeCode: "OPC", grade: "53", bagKg: 50 },
      { id: "p2", name: "Other Trade OPC 53", brand: "Other", channel: "trade", typeCode: "OPC", grade: "53", bagKg: 50 },
    ];
    expect(renamedProducts(rows)).toEqual([{ id: "p1", name: "Prisma Trade OPC 53" }]);
  });
});

describe("shortProductName", () => {
  it("drops the brand while only one brand is on", () => {
    expect(shortProductName("Prism Trade OPC 43", ["Prism", "UltraTech"], false)).toBe("Trade OPC 43");
    expect(shortProductName("Prism Non-trade PPC 53 40kg", ["Prism"], false)).toBe("Non-trade PPC 53 40kg");
  });
  it("keeps the brand when more than one brand is on", () => {
    expect(shortProductName("Prism Trade OPC 43", ["Prism", "UltraTech"], true)).toBe("Prism Trade OPC 43");
  });
  it("prefers the longest matching brand and leaves other names alone", () => {
    expect(shortProductName("Ultra Tech Trade OPC 43", ["Ultra", "Ultra Tech"], false)).toBe("Trade OPC 43");
    expect(shortProductName("Trade OPC 43", ["Prism"], false)).toBe("Trade OPC 43");
    expect(shortProductName("Prismatic Trade OPC 43", ["Prism"], false)).toBe("Prismatic Trade OPC 43");
  });
});
