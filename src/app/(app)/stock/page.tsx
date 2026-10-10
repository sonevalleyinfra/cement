import Link from "next/link";
import { getProducts } from "@/lib/catalogue";
import { can, rolesFor } from "@/lib/permissions";
import { isAdmin } from "@/lib/roles";
import { requireRole } from "@/lib/session";
import { getBalances } from "@/lib/stock";
import { StockView } from "./stock-view";

const linkClass = "rounded-xl bg-card px-3 py-2 text-sm font-semibold shadow-card ring-1 ring-foreground/6";

export default async function StockPage() {
  const session = await requireRole(...rolesFor("viewStock"));
  const admin = isAdmin(session.user.role);
  const [products, balances] = await Promise.all([getProducts({ activeOnly: false }), getBalances()]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Stock</h1>
      {(admin || can(session.user.role, "transferStock")) && (
        <div className="flex flex-wrap gap-2">
          {admin && <Link href="/stock/purchase" className={linkClass}>Purchase</Link>}
          {admin && <Link href="/stock/opening" className={linkClass}>Opening</Link>}
          {admin && <Link href="/stock/adjust" className={linkClass}>Adjust</Link>}
          {can(session.user.role, "transferStock") && <Link href="/stock/transfer" className={linkClass}>Move bags</Link>}
          {admin && <Link href="/godowns" className={linkClass}>Godowns</Link>}
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
