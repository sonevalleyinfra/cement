import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { godowns, stockLocations, stockMovements, vehicles } from "@/db/schema";

/**
 * Read-only: bags per product and place for one firm (or every firm, one row per firm, when null). Server-only.
 * `placeKey` matches the place drop-downs; `locationName` is the godown name or vehicle number.
 */
export async function getBalances(firmId: string | null, productId?: string) {
  const name = sql<string>`coalesce(${godowns.name}, ${vehicles.number}, ${stockLocations.name})`;
  const key = sql<string>`${stockLocations.kind} || ':' || coalesce(${stockLocations.godownId}, ${stockLocations.vehicleId})::text`;
  return db
    .select({
      productId: stockMovements.productId,
      locationId: stockMovements.locationId,
      placeKey: key,
      locationName: name,
      kind: stockLocations.kind,
      placeActive: sql<boolean>`coalesce(${godowns.active}, ${vehicles.active}, false)`,
      bags: sql<number>`coalesce(sum(${stockMovements.bags}), 0)`.mapWith(Number),
    })
    .from(stockMovements)
    .innerJoin(stockLocations, eq(stockLocations.id, stockMovements.locationId))
    .leftJoin(godowns, eq(godowns.id, stockLocations.godownId))
    .leftJoin(vehicles, eq(vehicles.id, stockLocations.vehicleId))
    .where(
      and(
        firmId ? eq(stockMovements.firmId, firmId) : undefined,
        productId ? eq(stockMovements.productId, productId) : undefined,
      ),
    )
    .groupBy(
      stockMovements.productId,
      stockMovements.locationId,
      stockLocations.kind,
      stockLocations.godownId,
      stockLocations.vehicleId,
      stockLocations.name,
      godowns.name,
      godowns.active,
      vehicles.number,
      vehicles.active,
    );
}
