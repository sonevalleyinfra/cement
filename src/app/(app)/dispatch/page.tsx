import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { dispatches, orders, products, retailers } from "@/db/schema";
import { getBalances } from "@/lib/stock";
import { rolesFor } from "@/lib/permissions";
import { isAdmin } from "@/lib/roles";
import { requireRole } from "@/lib/session";
import { DispatchView } from "./dispatch-view";

export default async function DispatchPage() {
  const { user } = await requireRole(...rolesFor("dispatch"));

  // Every approved or partly dispatched order: any logistics person may send it.
  const [rows, balances] = await Promise.all([
    db
      .select({
        id: orders.id,
        productId: orders.productId,
        bags: orders.bags,
        status: orders.status,
        retailer: retailers.name,
        product: products.name,
        sent: sql<number>`coalesce((select sum(${dispatches.bags}) from ${dispatches} where ${dispatches.orderId} = ${orders.id}), 0)`.mapWith(Number),
      })
      .from(orders)
      .innerJoin(retailers, eq(orders.retailerId, retailers.id))
      .innerJoin(products, eq(orders.productId, products.id))
      .where(inArray(orders.status, ["approved", "partly_dispatched"]))
      .orderBy(asc(orders.createdAt))
      .limit(100),
    getBalances(),
  ]);
  // Places with stock history (godown still switched on), godowns first.
  // Trucks are hired, so only the ones holding bags right now are listed.
  const loadedTrucks = new Set(balances.filter((b) => b.kind === "vehicle" && b.bags > 0).map((b) => b.placeKey));
  const places = [
    ...new Map(
      balances
        .filter((b) => b.placeActive && (b.kind !== "vehicle" || loadedTrucks.has(b.placeKey)))
        .sort((a, b) => a.kind.localeCompare(b.kind) || a.placeName.localeCompare(b.placeName))
        .map((b) => [
          b.placeKey,
          {
            key: b.placeKey,
            name: b.kind === "vehicle" ? `Truck ${b.placeName}` : b.placeName,
            truck: b.kind === "vehicle" ? b.placeName : null,
          },
        ]),
    ).values(),
  ];

  return (
    <DispatchView
      isAdmin={isAdmin(user.role)}
      orders={rows}
      places={places}
      balances={balances.map((b) => ({ productId: b.productId, placeKey: b.placeKey, bags: b.bags }))}
    />
  );
}
