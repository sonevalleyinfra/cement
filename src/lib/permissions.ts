/**
 * Who may open which screen or run which action, in one place.
 * Plain data + plain functions (no database) so the whole matrix is tested.
 * Source: docs/idea.md section 1 (Roles).
 *
 * Admin passes every check (same as hasAnyRole in roles.ts).
 * Finer rules (the shop's sales person, own shop, own wallet, order status) live next to the
 * feature (order-rules, rate-rules, wallet-rules...) and are checked on top of this.
 *
 * Choices where the spec is silent:
 * - "Any staff member (not retailer) can record a payment" = every staff role (sales,
 *   accounts, logistics) and admin. A retailer cannot record a payment to themselves.
 * - Everyone who can record cash holds it, so every staff member has a cash-held balance
 *   ("useWallet") and can ask to hand it over.
 * - Retailers, vehicles and stock are internal screens: staff only. A retailer sees
 *   their own orders, ledger and home screen.
 */
import { hasAnyRole, type Role } from "./roles";

const STAFF: readonly Role[] = ["sales", "accounts", "logistics"];

export const ACTION_ROLES = {
  // Orders (docs/idea.md section 3)
  placeOrder: ["sales", "retailer"],
  /** Fill or change the rate while the order is placed (only the shop's own sales person). */
  fillRate: ["sales"],
  decideOrder: ["accounts"],
  viewApprovals: ["accounts"],
  dispatch: ["logistics"],
  /** Change the rate after approval, with a reason. */
  changeRate: ["logistics"],
  /** Cancel the bags not dispatched yet, with a reason. */
  cancelOrder: ["admin"],
  // Money (docs/idea.md sections 5 and 6)
  /** Record a cash or online payment from a retailer. */
  recordReceipt: STAFF,
  /** See every payment (a retailer sees only their own, checked separately). */
  viewReceipts: STAFF,
  /** Tap "Verified" or reject an online payment. */
  verifyPayments: ["accounts"],
  /** Hold cash and ask to hand it over. */
  useWallet: STAFF,
  /** Answer a handover: received in full, part, or reject. Also see everyone's cash held. */
  confirmHandover: ["accounts"],
  /** Reverse a received cash or verified online payment, with a reason. */
  reverseReceipt: ["accounts"],
  viewLedger: ["sales", "accounts", "retailer"],
  setOpeningBalance: ["admin"],
  /** Add a + or - adjustment to a retailer's ledger, with a reason. */
  adjustLedger: ["admin"],
  // Prism account (docs/idea.md section 7): admin only
  viewPrism: ["admin"],
  /** Opening balance, payment to Prism, scheme credit and adjustment. (A purchase is `manageStock`.) */
  managePrism: ["admin"],
  // Stock
  viewStock: STAFF,
  manageStock: ["admin"],
  /** Move bags between two places (godown / vehicle). */
  transferStock: ["logistics"],
  // Masters
  viewRetailers: STAFF,
  editRetailers: ["sales"],
  linkRetailerLogin: ["admin"],
  /** Pick (or change) the sales person who looks after a retailer. */
  assignSalesRep: ["admin"],
  manageUsers: ["admin"],
  /** Types, grades and products (the drop-down lists). The brand is always Prism. */
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
