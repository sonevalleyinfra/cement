import { ArrowLeftRight, PackageOpen, PackagePlus, SlidersHorizontal, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { IconTile } from "@/components/app/icon-tile";
import { PageHeader } from "@/components/app/page-header";
import { getProducts } from "@/lib/catalogue";
import { can, rolesFor } from "@/lib/permissions";
import { isAdmin } from "@/lib/roles";
import { requireRole } from "@/lib/session";
import { getBalances } from "@/lib/stock";
import { cn } from "@/lib/utils";
import { StockView } from "./stock-view";

const tileClass =
  "flex min-h-16 items-center gap-3 rounded-2xl bg-card p-3 text-base font-semibold shadow-card ring-1 ring-foreground/6 transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-card-hover active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring";

export default async function StockPage() {
  const session = await requireRole(...rolesFor("viewStock"));
  const admin = isAdmin(session.user.role);
  const [products, balances] = await Promise.all([getProducts({ activeOnly: false }), getBalances()]);
  const tiles: { href: string; label: string; icon: LucideIcon }[] = [
    ...(admin
      ? [
          { href: "/stock/purchase", label: "Purchase", icon: PackagePlus },
          { href: "/stock/opening", label: "Opening", icon: PackageOpen },
          { href: "/stock/adjust", label: "Adjust", icon: SlidersHorizontal },
        ]
      : []),
    ...(can(session.user.role, "transferStock") ? [{ href: "/stock/transfer", label: "Move bags", icon: ArrowLeftRight }] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Stock" />
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
