import { describe, expect, it } from "vitest";
import { SHOP_CATEGORIES, SHOP_CATEGORY_LABELS, canHaveShopLogin, matchesCategoryFilter, shopCategoryOf } from "./shop-lists";

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
    // category, all, retailer, customer
    ["retailer", true, true, false],
    ["customer", true, false, true],
    ["sub_dealer", true, false, false],
    ["builder", true, false, false],
    ["institution", true, false, false],
    [null, true, true, false],
  ];
  it.each(cases)("%s", (category, all, retailer, customer) => {
    expect(matchesCategoryFilter(category, "all")).toBe(all);
    expect(matchesCategoryFilter(category, "retailer")).toBe(retailer);
    expect(matchesCategoryFilter(category, "customer")).toBe(customer);
  });
});

describe("customer label and login rule", () => {
  it("labels customer category as Customer and blocks login for customers", () => {
    expect(SHOP_CATEGORY_LABELS.customer).toBe("Customer");
    expect(canHaveShopLogin("customer")).toBe(false);
    expect(canHaveShopLogin("retailer")).toBe(true);
    expect(canHaveShopLogin(null)).toBe(true);
  });
});
