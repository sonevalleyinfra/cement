import type { ReactNode } from "react";
import { AppShell } from "@/components/app/app-shell";
import { FirmSwitcher } from "@/components/app/firm-switcher";
import type { NavItem } from "@/components/app/bottom-nav";
import { requireUser } from "@/lib/session";

const nav: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/retailers", label: "Retailers", icon: "retailers" },
  { href: "/vehicles", label: "Vehicles", icon: "vehicles" },
  { href: "/more", label: "More", icon: "more" },
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireUser();
  return (
    <AppShell title="Cement" headerRight={<FirmSwitcher />} nav={nav}>
      {children}
    </AppShell>
  );
}
