"use client";

import { ClipboardList, Home, MoreHorizontal, Package, Store, Truck, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Icons are picked by name because components cannot be passed from server to client. */
const icons = {
  home: Home,
  orders: ClipboardList,
  stock: Package,
  money: Wallet,
  retailers: Store,
  vehicles: Truck,
  more: MoreHorizontal,
};

export type NavItem = { href: string; label: string; icon: keyof typeof icons };

/** Fixed bottom tabs. Four at most. */
export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
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
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors duration-150",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "size-6 transition-transform duration-150 ease-out",
                    active && "scale-110",
                  )}
                  strokeWidth={active ? 2.4 : 1.8}
                />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
