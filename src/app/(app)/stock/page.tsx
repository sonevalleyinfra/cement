import { ArrowLeftRight, PackageOpen, PackagePlus, SlidersHorizontal, Truck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { IconTile } from "@/components/app/icon-tile";
import { PageHeader } from "@/components/app/page-header";
import { Stat } from "@/components/app/stat";
import { getProducts } from "@/lib/catalogue";
import { istDayStart } from "@/lib/home-rules";
import { can, rolesFor } from "@/lib/permissions";
import { isAdmin } from "@/lib/roles";
import { requireRole } from "@/lib/session";
import { getBalances } from "@/lib/stock";
import { truckCounts } from "@/lib/truck-rules";
import { countDispatchedSince, getTrucks } from "@/lib/trucks";
import { cn } from "@/lib/utils";
import { formatCount } from "@/lib/words";
import { StockView } from "./stock-view";

const tileClass =
  "flex min-h-16 items-center gap-3 rounded-2xl bg-card p-3 text-base font-semibold shadow-card ring-1 ring-foreground/6 transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-card-hover active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring";

const counterClass = "rounded-2xl bg-card p-3 text-foreground shadow-card ring-1 ring-foreground/6";

export default async function StockPage() {
  const session = await requireRole(...rolesFor("viewStock"));
  const admin = isAdmin(session.user.role);
  const [products, balances, trucks, sentToday] = await Promise.all([
    getProducts({ activeOnly: false }),
    getBalances(),
    getTrucks(),
    countDispatchedSince(istDayStart(new Date())),
  ]);

  const godownBags = balances.filter((b) => b.kind === "godown").reduce((sum, b) => sum + b.bags, 0);
  const { loaded, standing } = truckCounts(trucks);

  const tiles: { href: string; label: string; icon: LucideIcon }[] = [
    ...(can(session.user.role, "recordPurchase")
      ? [{ href: "/stock/purchase", label: "Purchase", icon: PackagePlus }]
      : []),
    ...(can(session.user.role, "dispatch") ? [{ href: "/trucks", label: "Trucks", icon: Truck }] : []),
    ...(admin
      ? [
          { href: "/stock/opening", label: "Opening", icon: PackageOpen },
          { href: "/stock/adjust", label: "Adjust", icon: SlidersHorizontal },
        ]
      : []),
    ...(can(session.user.role, "transferStock") ? [{ href: "/stock/transfer", label: "Move bags", icon: ArrowLeftRight }] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Stock" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Godown" value={`${formatCount(godownBags)} bags`} className="rounded-2xl bg-primary/10 p-3 text-primary ring-1 ring-primary/20" />
        <Link href="/trucks?tab=standing" className="transition-transform active:scale-[0.98]"><Stat label="Standing" value={formatCount(standing)} className={counterClass} /></Link>
        <Link href="/trucks?tab=loaded" className="transition-transform active:scale-[0.98]"><Stat label="Loaded" value={formatCount(loaded)} className={counterClass} /></Link>
        <Stat label="Sent today" value={formatCount(sentToday)} className={counterClass} />
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
