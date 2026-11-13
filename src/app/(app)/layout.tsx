import type { ReactNode } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { AppShell, AppTitle } from "@/components/app/app-shell";
import { NotificationBell } from "@/components/app/notification-bell";
import { navFor } from "@/lib/nav-rules";
import { requireUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user } = await requireUser();
  const nav = navFor(user.role);
  return (
    <AppShell
      headerLeft={<AppTitle user={user} />}
      headerRight={
        <div className="flex items-center gap-1.5">
          <NotificationBell />
          {nav.length === 0 && (
            <Link
              href="/more"
              aria-label="More"
              className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <MoreHorizontal className="size-5" />
            </Link>
          )}
        </div>
      }
      nav={nav}
    >
      {children}
    </AppShell>
  );
}
