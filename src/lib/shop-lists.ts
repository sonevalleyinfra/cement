/**
 * Fixed lists for the shop master, with their labels. No imports, so the database schema can use
 * them for its CHECK constraints (src/db/schema/retailers.ts).
 */

/** What kind of buyer a shop is: Retailer (shop owner) or Contractor (builder/site contractor). */
export const SHOP_CATEGORIES = ["retailer", "contractor"] as const;
export type ShopCategory = (typeof SHOP_CATEGORIES)[number];

export const SHOP_CATEGORY_LABELS: Record<ShopCategory, string> = {
  retailer: "Retailer",
  contractor: "Contractor",
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
