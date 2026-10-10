import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { godowns, stockLocations, stockMovements } from "@/db/schema";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { GodownsView } from "./godowns-view";

export default async function GodownsPage() {
  await requireRole(...rolesFor("manageStock"));
  const [rows, totals] = await Promise.all([
    db
      .select({ id: godowns.id, name: godowns.name, address: godowns.address, active: godowns.active })
      .from(godowns)
      .orderBy(desc(godowns.active), asc(godowns.name)),
    // Bags in each godown, all firms together.
    db
      .select({
        godownId: stockLocations.godownId,
        bags: sql<number>`coalesce(sum(${stockMovements.bags}), 0)`.mapWith(Number),
      })
      .from(stockMovements)
      .innerJoin(stockLocations, eq(stockLocations.id, stockMovements.locationId))
      .where(eq(stockLocations.kind, "godown"))
      .groupBy(stockLocations.godownId),
  ]);
  const bagsOf = (id: string) => totals.find((t) => t.godownId === id)?.bags ?? 0;
  return <GodownsView rows={rows.map((r) => ({ ...r, bags: bagsOf(r.id) }))} />;
}
