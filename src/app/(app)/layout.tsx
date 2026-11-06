import type { ReactNode } from "react";
import { AppShell, AppTitle } from "@/components/app/app-shell";
import { NotificationBell } from "@/components/app/notification-bell";
import { navFor } from "@/lib/nav-rules";
import { requireUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user } = await requireUser();
  const nav = navFor(user.role);
  return (
    <AppShell headerLeft={<AppTitle user={user} />} headerRight={<NotificationBell />} nav={nav}>
      {children}
    </AppShell>
  );
}
