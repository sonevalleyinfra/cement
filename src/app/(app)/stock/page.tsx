import {
  ArrowLeftRight,
  PackageOpen,
  PackagePlus,
  SlidersHorizontal,
  Truck,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { gte, sql } from "drizzle-orm";
import { IconTile } from "@/components/app/icon-tile";
import { PageHeader } from "@/components/app/page-header";
import { db } from "@/db";
import { dispatches } from "@/db/schema";
import { getProducts } from "@/lib/catalogue";
import { toISTDateKey } from "@/lib/datetime";
import { can, rolesFor } from "@/lib/permissions";
import { isAdmin } from "@/lib/roles";
import { requireRole } from "@/lib/session";
import { getBalances } from "@/lib/stock";
import { getTrucks } from "@/lib/trucks";
import { cn } from "@/lib/utils";
import { formatCount } from "@/lib/words";
import { StockView } from "./stock-view";

const tileClass =
  "flex min-h-16 items-center gap-3 rounded-2xl bg-card p-3 text-base font-semibold shadow-card ring-1 ring-foreground/6 transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-card-hover active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring";

export default async function StockPage() {
  const session = await requireRole(...rolesFor("viewStock"));
  const admin = isAdmin(session.user.role);
  const todayKey = toISTDateKey(new Date());

  const [products, balances, trucks, [todayDisp]] = await Promise.all([
    getProducts({ activeOnly: false }),
    getBalances(),
    getTrucks(),
    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(dispatches)
      .where(gte(dispatches.createdAt, sql`${todayKey}::date`)),
  ]);

  const availableGodownBags = balances
    .filter((b) => b.kind === "godown")
    .reduce((sum, b) => sum + b.bags, 0);

  const loadedTrucksCount = trucks.filter((t) => t.bags > 0).length;
  const standingTrucksCount = trucks.filter((t) => t.bags === 0 && t.active).length;
  const dispatchedTodayCount = todayDisp?.count ?? 0;

  const tiles: { href: string; label: string; icon: LucideIcon }[] = [
    ...(can(session.user.role, "recordPurchase")
      ? [{ href: "/stock/purchase", label: "Purchase", icon: PackagePlus }]
      : []),
    { href: "/trucks", label: "Trucks", icon: Truck },
    ...(admin
      ? [
          { href: "/stock/opening", label: "Opening", icon: PackageOpen },
          { href: "/stock/adjust", label: "Adjust", icon: SlidersHorizontal },
        ]
      : []),
    ...(can(session.user.role, "transferStock")
      ? [{ href: "/stock/transfer", label: "Move bags", icon: ArrowLeftRight }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Stock" />

      {/* Live Stock & Truck Operational Counters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-1 rounded-2xl bg-primary/10 p-3 ring-1 ring-primary/20">
          <span className="text-xs font-semibold text-primary">Godown Stock</span>
          <p className="tabular text-xl font-bold text-primary">
            {formatCount(availableGodownBags)} <span className="text-xs font-normal">bags</span>
          </p>
        </div>
        <div className="flex flex-col gap-1 rounded-2xl bg-card p-3 shadow-card ring-1 ring-foreground/6">
          <span className="text-xs font-medium text-muted-foreground">Standing (Empty)</span>
          <p className="tabular text-xl font-bold text-foreground">{standingTrucksCount}</p>
        </div>
        <div className="flex flex-col gap-1 rounded-2xl bg-card p-3 shadow-card ring-1 ring-foreground/6">
          <span className="text-xs font-medium text-muted-foreground">Loaded Trucks</span>
          <p className="tabular text-xl font-bold text-blue-600">{loadedTrucksCount}</p>
        </div>
        <div className="flex flex-col gap-1 rounded-2xl bg-card p-3 shadow-card ring-1 ring-foreground/6">
          <span className="text-xs font-medium text-muted-foreground">Dispatched Today</span>
          <p className="tabular text-xl font-bold text-emerald-600">{dispatchedTodayCount}</p>
        </div>
      </div>

      {tiles.length > 0 && (
        <div className="mb-2 grid grid-cols-2 gap-3">
          {tiles.map((t, i) => (
            <Link
              key={t.href}
              href={t.href}
              className={cn(tileClass, tiles.length % 2 === 1 && i === tiles.length - 1 && "col-span-2")}
            >
              <IconTile icon={t.icon} tone="blue" />
              {t.label}
            </Link>
          ))}
        </div>
      )}

      <StockView
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          brand: p.brand,
          channel: p.channel,
          typeCode: p.typeCode,
          grade: p.grade,
          bagKg: p.bagKg,
        }))}
        rows={balances.map((b) => ({
          productId: b.productId,
          placeKey: b.placeKey,
          placeName: b.placeName,
          placeKind: b.kind,
          bags: b.bags,
        }))}
      />
    </div>
  );
}
