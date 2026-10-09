import type { ReactNode } from "react";
import { AppShell } from "@/components/app/app-shell";
import { FirmSwitcher } from "@/components/app/firm-switcher";
import type { NavItem } from "@/components/app/bottom-nav";
import { NotificationBell } from "@/components/app/notification-bell";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";

/** Bottom tabs. The third tab is Retailers for staff and Ledger (own dues) for a retailer. */
function navFor(role: string | null | undefined): NavItem[] {
  const third: NavItem = can(role, "viewRetailers")
    ? { href: "/retailers", label: "Retailers", icon: "retailers" }
    : { href: "/ledger", label: "Dues", icon: "money" };
  return [
    { href: "/dashboard", label: "Home", icon: "home" },
    { href: "/orders", label: "Orders", icon: "orders" },
    third,
    { href: "/more", label: "More", icon: "more" },
  ];
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user } = await requireUser();
  const nav = navFor(user.role);
  return (
    <AppShell title="Cement" headerRight={
        <div className="flex items-center gap-1">
          <NotificationBell />
          <FirmSwitcher />
        </div>
      } nav={nav}>
      {children}
    </AppShell>
  );
}
