/**
 * The bottom tabs per role, as plain functions (no database, no request).
 * Home, Orders and More are the same for everyone; the third tab is the role's own job:
 * sales and admin Retailers, accounts Payments, logistics Stock, a shop its own Dues.
 * A person with several staff roles gets the first match in that order.
 */
import type { NavItem } from "@/components/app/bottom-nav";
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
