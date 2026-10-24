/**
 * The bottom tabs per role, as plain functions (no database, no request).
 * Home, Orders and More are the same for everyone; the third tab is the role's own job:
 * sales and admin Retailers, accounts Payments, logistics Stock, a shop its own Dues.
 * A person with several staff roles gets the first match in that order.
 */
import type { NavItem } from "@/components/app/bottom-nav";
import { can, type Action } from "./permissions";
import { hasRole, isAdmin } from "./roles";

export function thirdTab(role: string | null | undefined): NavItem {
  if (isAdmin(role) || hasRole(role, "sales")) return { href: "/retailers", label: "Retailers", icon: "retailers" };
  if (hasRole(role, "accounts")) return { href: "/receipts", label: "Payments", icon: "receipts" };
  if (hasRole(role, "logistics")) return { href: "/stock", label: "Stock", icon: "stock" };
  return { href: "/ledger", label: "Dues", icon: "money" };
}

export function navFor(role: string | null | undefined): NavItem[] {
  return [
    { href: "/dashboard", label: "Home", icon: "home" },
    { href: "/orders", label: "Orders", icon: "orders" },
    thirdTab(role),
    { href: "/more", label: "More", icon: "more" },
  ];
}

/** More does not repeat the role's own third tab (a shop's Ledger, accounts' Payments, logistics' Stock). */
export function moreHides(role: string | null | undefined, href: string): boolean {
  return href === thirdTab(role).href;
}

export type MoreRow = { href: string; label: string; permission?: Action; adminOnly?: boolean };
export type MoreGroup = { title: string; rows: MoreRow[] };

const MORE_GROUPS: MoreGroup[] = [
  {
    title: "Money",
    rows: [
      { href: "/receipts", label: "Payments", permission: "viewReceipts" },
      { href: "/wallet", label: "Cash", permission: "useWallet" },
      { href: "/ledger", label: "Ledger", permission: "viewLedger" },
      { href: "/suppliers", label: "Suppliers", permission: "viewSuppliers" },
      { href: "/approvals", label: "Approvals", permission: "viewApprovals" },
    ],
  },
  {
    title: "Goods",
    rows: [
      { href: "/stock", label: "Stock", permission: "viewStock" },
      { href: "/dispatch", label: "Dispatch", permission: "dispatch" },
      { href: "/godowns", label: "Godowns", permission: "manageStock" },
      { href: "/catalogue", label: "Catalogue", permission: "manageCatalogue" },
    ],
  },
  {
    title: "People",
    rows: [
      { href: "/users", label: "Users", permission: "manageUsers" },
      { href: "/areas", label: "Areas", permission: "editRetailers" },
    ],
  },
  {
    title: "Records",
    rows: [
      { href: "/reports", label: "Reports", permission: "viewReports" },
      { href: "/activity", label: "Activity", permission: "viewActivity" },
      { href: "/reports/books", label: "Books check", adminOnly: true },
    ],
  },
  { title: "Account", rows: [{ href: "/account", label: "Change password" }] },
];

/** The More screen's groups with only the rows this role may see; empty groups are dropped. */
export function moreGroups(role: string | null | undefined): MoreGroup[] {
  return MORE_GROUPS.map((g) => ({
    title: g.title,
    rows: g.rows.filter(
      (r) =>
        (!r.permission || can(role, r.permission)) && (!r.adminOnly || isAdmin(role)) && !moreHides(role, r.href),
    ),
  })).filter((g) => g.rows.length > 0);
}
