import type { ReactNode } from "react";
import { BottomNav, type NavItem } from "./bottom-nav";

/**
 * The frame every signed-in screen sits in: a header, one scrolling column
 * (max 448px, centred on bigger screens) and the bottom tabs.
 * The header holds only `headerLeft` (the firm switcher) and `headerRight` (the notification bell).
 */
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
      <main className="flex flex-1 flex-col px-4 pt-2 pb-[calc(5rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <BottomNav items={nav} />
    </div>
  );
}
