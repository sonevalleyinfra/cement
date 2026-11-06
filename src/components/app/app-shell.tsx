import type { ReactNode } from "react";
import { BottomNav, type NavItem } from "./bottom-nav";
import { OfflineNotice } from "./offline-notice";
import { parseRoles } from "@/lib/roles";

/**
 * The frame every signed-in screen sits in: a header, one scrolling column
 * (max 448px, centred on bigger screens) and the bottom tabs.
 * The header holds only `headerLeft` (user name & role) and `headerRight` (the notification bell).
 */
export function AppTitle({ user }: { user?: { name: string; role?: string | null } } = {}) {
  if (!user) {
    return <span className="truncate text-xl font-extrabold tracking-tight">Cement</span>;
  }
  const roles = parseRoles(user.role);
  const roleLabel = roles.length > 0 ? roles.map((r) => r.charAt(0).toUpperCase() + r.slice(1)).join(", ") : "";
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="truncate text-base font-bold tracking-tight text-foreground">{user.name}</span>
      {roleLabel && (
        <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
          {roleLabel}
        </span>
      )}
    </div>
  );
}

export function AppShell({
  headerLeft,
  headerRight,
  nav,
  children,
}: {
  headerLeft?: ReactNode;
  headerRight?: ReactNode;
  nav: NavItem[];
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 bg-background/55 px-4 backdrop-blur-xl">
        <div className="flex min-w-0 items-center">{headerLeft}</div>
        {headerRight}
      </header>
      <OfflineNotice />
      <main className="flex flex-1 flex-col px-4 pt-2 pb-[calc(5rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <BottomNav items={nav} />
    </div>
  );
}
