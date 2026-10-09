import type { ReactNode } from "react";
import { BottomNav, type NavItem } from "./bottom-nav";

/**
 * The frame every signed-in screen sits in: a quiet header, one scrolling column
 * (max 448px, centred on bigger screens) and the bottom tabs.
 * `headerRight` is where the firm chip goes once the firm switcher exists.
 */
export function AppShell({
  title,
  headerRight,
  nav,
  children,
}: {
  title: string;
  headerRight?: ReactNode;
  nav: NavItem[];
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 bg-background px-4">
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        {headerRight}
      </header>
      <main className="flex flex-1 flex-col px-4 pt-2 pb-[calc(5rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <BottomNav items={nav} />
    </div>
  );
}
