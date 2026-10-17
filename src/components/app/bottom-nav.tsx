"use client";

import { ClipboardList, Home, MoreHorizontal, Package, Receipt, Store, Truck, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Icons are picked by name because components cannot be passed from server to client. */
const icons = {
  home: Home,
  orders: ClipboardList,
  stock: Package,
  money: Wallet,
  receipts: Receipt,
  retailers: Store,
  vehicles: Truck,
  more: MoreHorizontal,
};

export type NavItem = { href: string; label: string; icon: keyof typeof icons };

/** Fixed bottom tabs. Four at most. The active tab gets a soft orange pill. */
export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-card/90 backdrop-blur-lg supports-[backdrop-filter]:bg-card/75">
      <ul className="mx-auto flex h-16 max-w-md pb-[env(safe-area-inset-bottom)] box-content">
        {items.map(({ href, label, icon }) => {
          const Icon = icons[icon];
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors duration-200",
                  active ? "font-semibold text-primary" : "text-muted-foreground active:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-14 items-center justify-center rounded-full transition-[background-color,transform] duration-200 ease-out",
                    active ? "bg-primary/12" : "bg-transparent",
                  )}
                >
                  <Icon
                    className={cn("size-[22px] transition-transform duration-200 ease-out", active && "scale-110")}
                    strokeWidth={active ? 2.4 : 1.8}
                  />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
