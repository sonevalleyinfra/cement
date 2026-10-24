import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { godowns, products, purchases, stockMovements, vehicles } from "@/db/schema";

/** How many purchases the Purchases list shows (newest first). */
export const PURCHASES_SHOWN = 50;

/**
 * The newest purchase headers with their movement, product and place. Server-only.
 * Purchases saved before headers existed (drizzle/0040) are not listed.
 */
export async function getPurchases() {
  return db
    .select({
      id: purchases.id,
      productName: products.name,
      placeName: sql<string>`coalesce(${godowns.name}, ${vehicles.number})`,
      invoiceNo: purchases.invoiceNo,
      invoiceDate: purchases.invoiceDate,
      truckNumber: purchases.truckNumber,
      driverName: purchases.driverName,
      driverPhone: purchases.driverPhone,
      billedBags: purchases.billedBags,
      shortBags: purchases.shortBags,
      burstBags: purchases.burstBags,
      receivedBags: purchases.receivedBags,
      unitCostPaise: stockMovements.unitCostPaise,
      landedUnitCostPaise: purchases.landedUnitCostPaise,
      claimStatus: purchases.claimStatus,
    })
    .from(purchases)
    .innerJoin(stockMovements, eq(stockMovements.id, purchases.stockMovementId))
    .innerJoin(products, eq(products.id, stockMovements.productId))
    .leftJoin(godowns, eq(godowns.id, stockMovements.godownId))
    .leftJoin(vehicles, eq(vehicles.id, stockMovements.vehicleId))
    .orderBy(desc(purchases.createdAt), desc(purchases.id))
    .limit(PURCHASES_SHOWN);
}
