import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { EmptyState } from "@/components/app/empty-state";
import { getFirmSelection } from "@/components/app/firm-switcher";
import { db } from "@/db";
import { dispatches, orders, products, retailers, user as users, vehicles } from "@/db/schema";
import { ordersUserMayDispatch } from "@/lib/dispatch-rules";
import { firmPeople } from "@/lib/logistics";
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

  const [rows, vehicleRows, balances, people] = await Promise.all([
    db
      .select({
        id: orders.id,
        firmId: orders.firmId,
        logisticsId: orders.logisticsId,
        assignee: users.name,
        productId: orders.productId,
        bags: orders.bags,
        ratePaise: orders.ratePaise,
        status: orders.status,
        retailer: retailers.name,
        product: products.name,
        sent: sql<number>`coalesce((select sum(${dispatches.bags}) from ${dispatches} where ${dispatches.orderId} = ${orders.id}), 0)`.mapWith(Number),
      })
      .from(orders)
      .innerJoin(retailers, eq(orders.retailerId, retailers.id))
      .innerJoin(products, eq(orders.productId, products.id))
      .leftJoin(users, eq(orders.logisticsId, users.id))
      .where(
        and(
          eq(orders.firmId, firmId),
          inArray(orders.status, ["approved", "assigned", "partly_dispatched", "dispatched"]),
        ),
      )
      .orderBy(asc(orders.createdAt))
      .limit(100),
    db.select().from(vehicles).orderBy(asc(vehicles.number)),
    getBalances(firmId),
    firmPeople(db, [firmId]),
  ]);
  // Places this firm has stock history at (godown or vehicle still switched on), godowns first.
  const locations = [
    ...new Map(
      balances
        .filter((b) => b.placeActive)
        .sort((a, b) => a.kind.localeCompare(b.kind) || a.locationName.localeCompare(b.locationName))
        .map((b) => [b.locationId, { id: b.locationId, name: b.kind === "vehicle" ? `Vehicle ${b.locationName}` : b.locationName }]),
    ).values(),
  ];
  // Only the orders this person may dispatch: their own, unassigned, or orphaned (admin: all).
  const mine = ordersUserMayDispatch({ id: user.id, role: user.role }, rows, people);

  return (
    <DispatchView
      firmId={firmId}
      isAdmin={admin}
      orders={mine.map((r) => ({
        id: r.id,
        productId: r.productId,
        retailer: r.retailer,
        product: r.product,
        bags: r.bags,
        sent: r.sent,
        ratePaise: r.ratePaise,
        status: r.status,
        assignee: r.assignee,
      }))}
      locations={locations}
      vehicles={vehicleRows
        .filter((v) => v.active)
        .map((v) => ({ id: v.id, number: v.number, driverName: v.driverName, driverPhone: v.driverPhone }))}
      balances={balances.map((b) => ({ productId: b.productId, locationId: b.locationId, bags: b.bags }))}
      userId={user.id}
    />
  );
}
