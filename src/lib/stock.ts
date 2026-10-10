import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { godowns, stockMovements, vehicles } from "@/db/schema";

/**
 * Read-only: bags per product and place (godown or truck). Server-only.
 * `placeKey` matches the place drop-downs ("godown:<id>" / "vehicle:<id>");
 * `placeName` is the godown name or truck number.
 */
export async function getBalances() {
  const key = sql<string>`coalesce('godown:' || ${stockMovements.godownId}::text, 'vehicle:' || ${stockMovements.vehicleId}::text)`;
  return db
    .select({
      productId: stockMovements.productId,
      placeKey: key,
      placeName: sql<string>`coalesce(${godowns.name}, ${vehicles.number})`,
      kind: sql<"godown" | "vehicle">`case when ${stockMovements.godownId} is null then 'vehicle' else 'godown' end`,
      placeActive: sql<boolean>`coalesce(${godowns.active}, ${vehicles.active}, false)`,
      bags: sql<number>`coalesce(sum(${stockMovements.bags}), 0)`.mapWith(Number),
    })
    .from(stockMovements)
    .leftJoin(godowns, eq(godowns.id, stockMovements.godownId))
    .leftJoin(vehicles, eq(vehicles.id, stockMovements.vehicleId))
    .groupBy(
      stockMovements.productId,
      stockMovements.godownId,
      stockMovements.vehicleId,
      godowns.name,
      godowns.active,
      vehicles.number,
      vehicles.active,
    );
}
