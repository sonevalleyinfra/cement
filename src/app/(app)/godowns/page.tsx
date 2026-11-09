import { asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { godowns, products, stockMovements } from "@/db/schema";
import { can, rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { GodownsView } from "./godowns-view";

export default async function GodownsPage() {
  const session = await requireRole(...rolesFor("viewStock"));
  const canManage = can(session.user.role, "manageStock");
  const [rows, totals, productTotals] = await Promise.all([
    db
      .select({ id: godowns.id, name: godowns.name, address: godowns.address, active: godowns.active })
      .from(godowns)
      .orderBy(desc(godowns.active), asc(godowns.name)),
    // Bags in each godown.
    db
      .select({
        godownId: stockMovements.godownId,
        bags: sql<number>`coalesce(sum(${stockMovements.bags}), 0)`.mapWith(Number),
      })
      .from(stockMovements)
      .where(isNotNull(stockMovements.godownId))
      .groupBy(stockMovements.godownId),
    // Per-product breakdown in each godown.
    db
      .select({
        godownId: stockMovements.godownId,
        productId: stockMovements.productId,
        productName: products.name,
        bags: sql<number>`coalesce(sum(${stockMovements.bags}), 0)`.mapWith(Number),
      })
      .from(stockMovements)
      .innerJoin(products, eq(stockMovements.productId, products.id))
      .where(isNotNull(stockMovements.godownId))
      .groupBy(stockMovements.godownId, stockMovements.productId, products.name),
  ]);
  const bagsOf = (id: string) => totals.find((t) => t.godownId === id)?.bags ?? 0;
  const productsOf = (id: string) =>
    productTotals
      .filter((p) => p.godownId === id && p.bags > 0)
      .map((p) => ({ id: p.productId, name: p.productName, bags: p.bags }));

  return (
    <GodownsView
      rows={rows.map((r) => ({ ...r, bags: bagsOf(r.id), products: productsOf(r.id) }))}
      canManage={canManage}
    />
  );
}
