import type { ReactNode } from "react";
import { AppShell, AppTitle } from "@/components/app/app-shell";
import { NotificationBell } from "@/components/app/notification-bell";
import { RefreshButton } from "@/components/app/refresh-button";
import { navFor } from "@/lib/nav-rules";
import { requireUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user } = await requireUser();
  return (
    <AppShell
      headerLeft={<AppTitle user={user} />}
      headerRight={
        <div className="flex items-center gap-1">
          <RefreshButton />
          <NotificationBell />
        </div>
      }
      nav={navFor()}
    >
      {children}
    </AppShell>
  );
}
