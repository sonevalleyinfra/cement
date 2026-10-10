/**
 * Who may open which screen or run which action, in one place.
 * Plain data + plain functions (no database) so the whole matrix is tested.
 * Source: docs/idea.md section 3 (Roles).
 *
 * Admin passes every check (same as hasAnyRole in roles.ts).
 * Finer rules (assigned rep, own shop, own wallet, order status) live next to the
 * feature (order-rules, rate-rules, wallet-rules...) and are checked on top of this.
 *
 * Choices where the spec is silent:
 * - "Collections: any user can record a collection" = every staff role (sales,
 *   accounts, logistics). A retailer cannot record a payment to themselves.
 * - Retailers, vehicles and stock are internal screens: staff only. A retailer sees
 *   their own orders, ledger and home screen.
 */
import { hasAnyRole, type Role } from "./roles";

const STAFF: readonly Role[] = ["sales", "accounts", "logistics"];

export const ACTION_ROLES = {
  // Orders
  placeOrder: ["sales", "retailer"],
  fillRate: ["sales"],
  decideOrder: ["accounts"],
  viewApprovals: ["accounts"],
  dispatch: ["logistics"],
  markDelivered: ["logistics"],
  // Money
  recordReceipt: STAFF,
  viewReceipts: STAFF,
  verifyPayments: ["accounts"],
  useWallet: STAFF,
  confirmHandover: ["accounts"],
  reverseReceipt: ["accounts"],
  viewLedger: ["sales", "accounts", "retailer"],
  setOpeningBalance: ["admin"],
  // Stock
  viewStock: STAFF,
  manageStock: ["admin"],
  /** Move bags between two places (godown / vehicle) of the same firm. */
  transferStock: ["logistics"],
  // Masters
  viewRetailers: STAFF,
  editRetailers: ["sales"],
  linkRetailerLogin: ["admin"],
  viewVehicles: STAFF,
  editVehicles: ["logistics"],
  manageUsers: ["admin"],
  manageFirms: ["admin"],
  /** Brands, types, grades and products (the drop-down lists). */
  manageCatalogue: ["admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Action = keyof typeof ACTION_ROLES;

/** Roles allowed for an action, for `requireRole(...rolesFor("x"))`. */
export function rolesFor(action: Action): Role[] {
  return [...ACTION_ROLES[action]];
}

/** True if a user with this stored role string may do `action`. Admin always may. */
export function can(role: string | null | undefined, action: Action): boolean {
  return hasAnyRole(role, ACTION_ROLES[action]);
}

/** Staff = any working role (admin included). Retailers and users with no role are not staff. */
export function isStaff(role: string | null | undefined): boolean {
  return hasAnyRole(role, STAFF);
}
