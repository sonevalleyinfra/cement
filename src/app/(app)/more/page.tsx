import {
  BadgeCheck,
  BookOpen,
  ChartColumn,
  ChevronRight,
  Factory,
  History,
  KeyRound,
  Package,
  Receipt,
  Tags,
  Truck,
  Warehouse,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { IconTile, type Tone } from "@/components/app/icon-tile";
import { Button } from "@/components/ui/button";
import { moreHides } from "@/lib/nav-rules";
import { can, type Action } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { signOut } from "../dashboard/actions";

type Row = { href: string; label: string; icon: LucideIcon; tone: Tone; permission?: Action };

const rows: Row[] = [
  { href: "/reports", label: "Reports", icon: ChartColumn, tone: "orange", permission: "viewReports" },
  { href: "/activity", label: "Activity", icon: History, tone: "slate", permission: "viewActivity" },
  { href: "/users", label: "Users", icon: Users, tone: "violet", permission: "manageUsers" },
  { href: "/catalogue", label: "Catalogue", icon: Tags, tone: "blue", permission: "manageCatalogue" },
  { href: "/approvals", label: "Approvals", icon: BadgeCheck, tone: "violet", permission: "viewApprovals" },
  { href: "/stock", label: "Stock", icon: Package, tone: "blue", permission: "viewStock" },
  { href: "/godowns", label: "Godowns", icon: Warehouse, tone: "blue", permission: "manageStock" },
  { href: "/dispatch", label: "Dispatch", icon: Truck, tone: "blue", permission: "dispatch" },
  { href: "/suppliers", label: "Suppliers", icon: Factory, tone: "amber", permission: "viewSuppliers" },
  { href: "/ledger", label: "Ledger", icon: BookOpen, tone: "rose", permission: "viewLedger" },
  { href: "/receipts", label: "Payments", icon: Receipt, tone: "teal", permission: "viewReceipts" },
  { href: "/wallet", label: "Cash", icon: Wallet, tone: "green", permission: "useWallet" },
  { href: "/account", label: "Change password", icon: KeyRound, tone: "orange" },
];

export default async function MorePage() {
  const { user } = await requireUser();
  const visible = rows.filter((r) => (!r.permission || can(user.role, r.permission)) && !moreHides(user.role, r.href));
  return (
    <ul className="flex flex-col gap-3">
      {visible.map((r, i) => (
        <li key={r.href} className="animate-in-up" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
          <Link
            href={r.href}
            className="group flex w-full items-center gap-3 rounded-2xl bg-card p-3 pr-4 text-left text-base font-semibold shadow-card ring-1 ring-foreground/6 transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-card-hover active:scale-[0.99]"
          >
            <IconTile icon={r.icon} tone={r.tone} />
            <span className="flex-1">{r.label}</span>
            <ChevronRight
              aria-hidden
              className="size-5 text-muted-foreground/60 transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </Link>
        </li>
      ))}
      <li className="animate-in-up mt-2" style={{ animationDelay: `${Math.min(visible.length, 8) * 40}ms` }}>
        <form action={signOut}>
          <Button type="submit" variant="outline" className="w-full">
            Sign out
          </Button>
        </form>
      </li>
    </ul>
  );
}
