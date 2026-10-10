import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { getFirmSelection } from "@/components/app/firm-switcher";
import { getProducts } from "@/lib/catalogue";
import { can, rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { getBalances } from "@/lib/stock";
import { StockView } from "./stock-view";

const linkClass = "rounded-xl bg-card px-3 py-2 text-sm font-semibold shadow-card ring-1 ring-foreground/6";

export default async function StockPage() {
  const session = await requireRole(...rolesFor("viewStock"));
  const { selection, admin } = await getFirmSelection();
  if (selection.mode === "none") return <EmptyState title="No firm available" />;

  // "All firms" (admin) is read-only: every firm's bags added together.
  const [products, balances] = await Promise.all([
    getProducts({ activeOnly: false }),
    getBalances(selection.mode === "firm" ? selection.firmId : null),
  ]);

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
          {admin && <Link href="/godowns" className={linkClass}>Godowns</Link>}
        </div>
      )}
      <StockView
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          channel: p.channel,
          typeCode: p.typeCode,
          grade: p.grade,
          bagKg: p.bagKg,
        }))}
        rows={balances.map((b) => ({
          productId: b.productId,
          placeKey: b.placeKey,
          placeName: b.locationName,
          placeKind: b.kind,
          bags: b.bags,
        }))}
      />
    </div>
  );
}
