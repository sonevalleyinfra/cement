/**
 * Navigation rules as plain functions (no database, no request).
 * Owner decision (18 Nov 2026, PLAN-v3): the bottom bar has two items only, Home and More, for every
 * role. Every daily job is a button on Home; More lists every screen the role may open.
 */
import type { NavItem } from "@/components/app/bottom-nav";
import { can, type Action } from "./permissions";
import { hasAnyRole, hasRole, isAdmin, type Role } from "./roles";

export function navFor(): NavItem[] {
  return [
    { href: "/dashboard", label: "Home", icon: "home" },
    { href: "/more", label: "More", icon: "more" },
  ];
}

/**
 * The list screens a role opens straight from Home (its daily work). Their back arrow goes Home.
 * A person with several roles gets all of them.
 */
export function homeScreens(role: string | null | undefined): string[] {
  const screens = new Set<string>(["/orders"]);
  if (isAdmin(role)) for (const s of ["/retailers", "/trucks"]) screens.add(s);
  if (hasRole(role, "sales")) screens.add("/ledger");
  if (hasRole(role, "accounts")) for (const s of ["/receipts", "/trucks"]) screens.add(s);
  if (hasRole(role, "logistics")) for (const s of ["/stock", "/trucks"]) screens.add(s);
  if (hasRole(role, "retailer")) screens.add("/ledger");
  return [...screens];
}

/** Where a list screen's back arrow goes: Home when the role opens it from Home, otherwise More. */
export function backFor(role: string | null | undefined, href: string): string {
  return homeScreens(role).includes(href) ? "/dashboard" : "/more";
}

/** `roles` is for a screen with no permission of its own (admin always passes). */
export type MoreRow = { href: string; label: string; permission?: Action; roles?: Role[]; adminOnly?: boolean };
export type MoreGroup = { title: string; rows: MoreRow[] };

const MORE_GROUPS: MoreGroup[] = [
  {
    title: "Orders and shops",
    rows: [
      { href: "/orders", label: "Orders" },
      { href: "/retailers", label: "Retailers", permission: "viewRetailers" },
    ],
  },
  {
    title: "Money",
    rows: [
      { href: "/receipts", label: "Payments", permission: "viewReceipts" },
      { href: "/wallet", label: "Cash", permission: "useWallet" },
      { href: "/ledger", label: "Ledger", permission: "viewLedger" },
      { href: "/suppliers", label: "Suppliers", permission: "viewSuppliers" },
      { href: "/bank-accounts", label: "Bank accounts", permission: "manageBankAccounts" },
      { href: "/approvals", label: "Approvals", permission: "viewApprovals" },
    ],
  },
  {
    title: "Goods",
    rows: [
      { href: "/stock", label: "Stock", permission: "viewStock" },
      { href: "/dispatch", label: "Dispatch", permission: "dispatch" },
      { href: "/godowns", label: "Godowns", permission: "viewStock" },
      { href: "/trucks", label: "Trucks", roles: ["logistics", "accounts"] },
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
        (!r.permission || can(role, r.permission)) &&
        (!r.roles || hasAnyRole(role, r.roles)) &&
        (!r.adminOnly || isAdmin(role)),
    ),
  })).filter((g) => g.rows.length > 0);
}
