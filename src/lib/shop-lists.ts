/**
 * Fixed lists for the shop master, with their labels. No imports, so the database schema can use
 * them for its CHECK constraints (src/db/schema/retailers.ts).
 */

/** What kind of buyer a shop is. */
export const SHOP_CATEGORIES = ["retailer", "sub_dealer", "contractor", "builder", "institution"] as const;
export type ShopCategory = (typeof SHOP_CATEGORIES)[number];

export const SHOP_CATEGORY_LABELS: Record<ShopCategory, string> = {
  retailer: "Retailer",
  sub_dealer: "Sub-dealer",
  contractor: "Contractor",
  builder: "Builder",
  institution: "Institution",
};

/**
 * A shop's credit status. hold = no new approvals, blocked = no dispatch either.
 * Approving an order of a shop on hold or blocked needs an override reason (v2 B1); dispatch is not checked yet.
 */
export const CREDIT_STATUSES = ["ok", "hold", "blocked"] as const;
export type CreditStatus = (typeof CREDIT_STATUSES)[number];

export const CREDIT_STATUS_LABELS: Record<CreditStatus, string> = {
  ok: "OK",
  hold: "On hold",
  blocked: "Blocked",
};

export function isShopCategory(value: unknown): value is ShopCategory {
  return typeof value === "string" && (SHOP_CATEGORIES as readonly string[]).includes(value);
}

export function isCreditStatus(value: unknown): value is CreditStatus {
  return typeof value === "string" && (CREDIT_STATUSES as readonly string[]).includes(value);
}

/** A shop's category, read safely: missing or unknown counts as a retailer. */
export function shopCategoryOf(category: string | null | undefined): ShopCategory {
  return isShopCategory(category) ? category : "retailer";
}

/** The shop list's filter tabs. Sub-dealers, builders and institutions show only under All. */
export type CategoryFilter = "all" | "retailer" | "contractor";

export function matchesCategoryFilter(category: string | null | undefined, filter: CategoryFilter): boolean {
  return filter === "all" || shopCategoryOf(category) === filter;
}
