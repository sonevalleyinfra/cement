import Link from "next/link";
import { asc, sql } from "drizzle-orm";
import { EmptyState } from "@/components/app/empty-state";
import { getFirmSelection } from "@/components/app/firm-switcher";
import { Stat } from "@/components/app/stat";
import { db } from "@/db";
import { products, stockMovements } from "@/db/schema";
import { getBalances } from "@/lib/stock";
import { can, rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";

const linkClass = "rounded-xl bg-card px-3 py-2 text-sm font-semibold shadow-card ring-1 ring-foreground/6";

export default async function StockPage() {
  const session = await requireRole(...rolesFor("viewStock"));
  const { selection, admin } = await getFirmSelection();
  if (selection.mode === "none") return <EmptyState title="No firm available" />;

  const prods = await db.select().from(products).orderBy(asc(products.name));

  let totals: { productId: string; bags: number }[];
  let places: { productId: string; locationName: string; kind: string; bags: number }[] = [];
  if (selection.mode === "all") {
    // Read-only totals over every firm.
    totals = await db
      .select({
        productId: stockMovements.productId,
        bags: sql<number>`coalesce(sum(${stockMovements.bags}), 0)`.mapWith(Number),
      })
      .from(stockMovements)
      .groupBy(stockMovements.productId);
  } else {
    const rows = await getBalances(selection.firmId);
    places = rows.map((r) => ({ productId: r.productId, locationName: r.locationName, kind: r.kind, bags: r.bags }));
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.productId, (map.get(r.productId) ?? 0) + r.bags);
    totals = [...map].map(([productId, bags]) => ({ productId, bags }));
  }
  const totalOf = (id: string) => totals.find((t) => t.productId === id)?.bags ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">
        Stock {selection.mode === "all" && <span className="text-sm font-normal text-muted-foreground">(all firms)</span>}
      </h1>
      {selection.mode === "firm" && (admin || can(session.user.role, "transferStock")) && (
        <div className="flex flex-wrap gap-2">
          {admin && <Link href="/stock/purchase" className={linkClass}>Purchase</Link>}
          {admin && <Link href="/stock/opening" className={linkClass}>Opening</Link>}
          {admin && <Link href="/stock/adjust" className={linkClass}>Adjust</Link>}
          {can(session.user.role, "transferStock") && <Link href="/stock/transfer" className={linkClass}>Move bags</Link>}
          {admin && <Link href="/stock/locations" className={linkClass}>Places</Link>}
        </div>
      )}
      {prods.length === 0 && <EmptyState title="No products yet" />}
      <ul className="flex flex-col gap-3">
        {prods.map((p) => (
          <li key={p.id} className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6">
            <Stat label={p.name} value={`${totalOf(p.id)} bags`} />
            {places
              .filter((l) => l.productId === p.id && l.bags !== 0)
              .map((l) => (
                <div key={l.locationName} className="flex justify-between text-sm">
                  <span>{l.kind === "vehicle" ? `Vehicle ${l.locationName}` : l.locationName}</span>
                  <span className="tabular font-semibold">{l.bags}</span>
                </div>
              ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
