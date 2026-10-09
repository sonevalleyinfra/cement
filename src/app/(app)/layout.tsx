import type { ReactNode } from "react";
import { AppShell } from "@/components/app/app-shell";
import { FirmSwitcher } from "@/components/app/firm-switcher";
import type { NavItem } from "@/components/app/bottom-nav";
import { NotificationBell } from "@/components/app/notification-bell";
import { requireUser } from "@/lib/session";

const nav: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/orders", label: "Orders", icon: "orders" },
  { href: "/retailers", label: "Retailers", icon: "retailers" },
  { href: "/more", label: "More", icon: "more" },
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireUser();
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
