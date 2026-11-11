import { and, asc, eq, gt, inArray, isNotNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { godowns, purchases, stockMovements } from "@/db/schema";
import type { VehicleInflow } from "./sales-report";

/**
 * Loads positive stock inflows (`purchase` and `transfer`) for the given truck ids up to `before`,
 * pairing `transfer` inflows with the godown they were loaded from and `purchase` inflows with
 * their purchase invoice date. Used by both sales reports/CSV and the dispatch form.
 */
export async function getVehicleInflowOrigins(vehicleIds: readonly string[], before?: Date): Promise<VehicleInflow[]> {
  if (vehicleIds.length === 0) return [];
  const beforeFilter = before ? lt(stockMovements.createdAt, before) : undefined;

  const [inflows, godownOuts] = await Promise.all([
    db
      .select({
        vehicleId: stockMovements.vehicleId,
        productId: stockMovements.productId,
        type: stockMovements.type,
        bags: stockMovements.bags,
        reason: stockMovements.reason,
        createdAt: stockMovements.createdAt,
        invoiceDate: purchases.invoiceDate,
      })
      .from(stockMovements)
      .leftJoin(purchases, eq(purchases.stockMovementId, stockMovements.id))
      .where(
        and(
          inArray(stockMovements.vehicleId, [...vehicleIds]),
          inArray(stockMovements.type, ["purchase", "transfer"]),
          gt(stockMovements.bags, 0),
          beforeFilter,
        ),
      )
      .orderBy(asc(stockMovements.createdAt)),
    db
      .select({
        productId: stockMovements.productId,
        bags: stockMovements.bags,
        createdAt: stockMovements.createdAt,
        godownName: godowns.name,
      })
      .from(stockMovements)
      .innerJoin(godowns, eq(godowns.id, stockMovements.godownId))
      .where(
        and(
          eq(stockMovements.type, "transfer"),
          lt(stockMovements.bags, 0),
          isNotNull(stockMovements.godownId),
          beforeFilter,
        ),
      )
      .orderBy(asc(stockMovements.createdAt)),
  ]);

  const usedOuts = new Set<number>();
  return inflows
    .filter((i): i is typeof i & { vehicleId: string } => i.vehicleId !== null)
    .map((i) => {
      let transferFromGodownName: string | null = null;
      if (i.type === "transfer") {
        const tIn = i.createdAt.getTime();
        let bestIdx = -1;
        let bestDiff = 5001;
        for (let idx = 0; idx < godownOuts.length; idx++) {
          if (usedOuts.has(idx)) continue;
          const out = godownOuts[idx];
          if (out.productId !== i.productId || out.bags !== -i.bags) continue;
          const diff = Math.abs(out.createdAt.getTime() - tIn);
          if (diff < bestDiff) {
            bestDiff = diff;
            bestIdx = idx;
          }
        }
        if (bestIdx !== -1) {
          usedOuts.add(bestIdx);
          transferFromGodownName = godownOuts[bestIdx].godownName;
        }
      }
      return {
        vehicleId: i.vehicleId,
        productId: i.productId,
        type: i.type,
        bags: i.bags,
        reason: i.reason,
        createdAt: i.createdAt,
        invoiceDate: i.invoiceDate ?? null,
        transferFromGodownName,
      };
    });
}
