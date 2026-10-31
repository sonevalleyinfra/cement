import { describe, expect, it } from "vitest";
import { SHOP_CATEGORIES, matchesCategoryFilter, shopCategoryOf } from "./shop-lists";

describe("shopCategoryOf", () => {
  it("keeps every known category", () => {
    for (const c of SHOP_CATEGORIES) expect(shopCategoryOf(c)).toBe(c);
  });

  it("reads missing or unknown as retailer", () => {
    expect(shopCategoryOf(null)).toBe("retailer");
    expect(shopCategoryOf(undefined)).toBe("retailer");
    expect(shopCategoryOf("")).toBe("retailer");
    expect(shopCategoryOf("wholesaler")).toBe("retailer");
  });
});

describe("matchesCategoryFilter", () => {
  const cases: [string | null, boolean, boolean, boolean][] = [
    // category, all, retailer, contractor
    ["retailer", true, true, false],
    ["contractor", true, false, true],
    ["sub_dealer", true, false, false],
    ["builder", true, false, false],
    ["institution", true, false, false],
    [null, true, true, false],
  ];
  it.each(cases)("%s", (category, all, retailer, contractor) => {
    expect(matchesCategoryFilter(category, "all")).toBe(all);
    expect(matchesCategoryFilter(category, "retailer")).toBe(retailer);
    expect(matchesCategoryFilter(category, "contractor")).toBe(contractor);
  });
});
