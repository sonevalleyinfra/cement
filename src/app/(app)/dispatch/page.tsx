import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { EmptyState } from "@/components/app/empty-state";
import { getFirmSelection } from "@/components/app/firm-switcher";
import { db } from "@/db";
import { dispatches, orders, products, retailers, stockLocations, vehicles } from "@/db/schema";
import { getBalances } from "@/lib/stock";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { DispatchView } from "./dispatch-view";

export default async function DispatchPage() {
  const { user } = await requireRole(...rolesFor("dispatch"));
  const { selection, admin } = await getFirmSelection();
  if (selection.mode === "none") return <EmptyState title="No firm available" />;
  if (selection.mode === "all") return <EmptyState title="Pick one firm to dispatch" />;
  const firmId = selection.firmId;

  const [rows, locations, vehicleRows, balances] = await Promise.all([
    db
      .select({
        id: orders.id,
        productId: orders.productId,
        bags: orders.bags,
        ratePaise: orders.ratePaise,
        status: orders.status,
        retailer: retailers.name,
        product: products.name,
        sent: sql<number>`coalesce((select sum(${dispatches.bags}) from ${dispatches} where ${dispatches.orderId} = ${orders.id}), 0)::int`,
      })
      .from(orders)
      .innerJoin(retailers, eq(orders.retailerId, retailers.id))
      .innerJoin(products, eq(orders.productId, products.id))
      .where(
        and(
          eq(orders.firmId, firmId),
          inArray(orders.status, ["approved", "assigned", "partly_dispatched", "dispatched"]),
        ),
      )
      .orderBy(asc(orders.createdAt))
      .limit(100),
    db.select().from(stockLocations).where(eq(stockLocations.firmId, firmId)).orderBy(asc(stockLocations.name)),
    db.select().from(vehicles).orderBy(asc(vehicles.number)),
    getBalances(firmId),
  ]);

  return (
    <DispatchView
      firmId={firmId}
      isAdmin={admin}
      orders={rows.map((r) => ({
        id: r.id,
        productId: r.productId,
        retailer: r.retailer,
        product: r.product,
        bags: r.bags,
        sent: r.sent,
        ratePaise: r.ratePaise,
        status: r.status,
      }))}
      locations={locations.filter((l) => l.active).map((l) => ({ id: l.id, name: l.name }))}
      vehicles={vehicleRows
        .filter((v) => v.active)
        .map((v) => ({ id: v.id, number: v.number, driverName: v.driverName, driverPhone: v.driverPhone }))}
      balances={balances.map((b) => ({ productId: b.productId, locationId: b.locationId, bags: b.bags }))}
      userId={user.id}
    />
  );
}
