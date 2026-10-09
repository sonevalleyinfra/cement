import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { stockLocations, stockMovements } from "@/db/schema";

/** Read-only: bags per product and location for one firm. Server-only. */
export async function getBalances(firmId: string, productId?: string) {
  return db
    .select({
      productId: stockMovements.productId,
      locationId: stockMovements.locationId,
      locationName: stockLocations.name,
      kind: stockLocations.kind,
      bags: sql<number>`coalesce(sum(${stockMovements.bags}), 0)::int`,
    })
    .from(stockMovements)
    .innerJoin(stockLocations, eq(stockLocations.id, stockMovements.locationId))
    .where(
      and(
        eq(stockMovements.firmId, firmId),
        productId ? eq(stockMovements.productId, productId) : undefined,
      ),
    )
    .groupBy(
      stockMovements.productId,
      stockMovements.locationId,
      stockLocations.name,
      stockLocations.kind,
    );
}

/** Bags of one product in one location for one firm. */
export async function getBalance(firmId: string, productId: string, locationId: string) {
  const [row] = await db
    .select({ bags: sql<number>`coalesce(sum(${stockMovements.bags}), 0)::int` })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.firmId, firmId),
        eq(stockMovements.productId, productId),
        eq(stockMovements.locationId, locationId),
      ),
    );
  return row?.bags ?? 0;
}
