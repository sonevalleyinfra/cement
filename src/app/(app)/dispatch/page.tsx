import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { db } from "@/db";
import { dispatches, orders, products, retailers, vehicles } from "@/db/schema";
import { formatDate, toISTDateKey } from "@/lib/datetime";
import { truckChips } from "@/lib/dispatch-rules";
import { byRequiredBy, isPastRequiredBy } from "@/lib/order-delivery-rules";
import { getBalances } from "@/lib/stock";
import { parsePlaceKey } from "@/lib/stock-rules";
import { resolveDispatchOrigin } from "@/lib/sales-report";
import { getVehicleInflowOrigins } from "@/lib/truck-origins";
import { can, rolesFor } from "@/lib/permissions";
import { isAdmin } from "@/lib/roles";
import { requireRole } from "@/lib/session";
import { getActiveTrucks } from "@/lib/trucks";
import { DispatchView } from "./dispatch-view";

export default async function DispatchPage({
  searchParams,
}: {
  searchParams?: Promise<{ orderId?: string }>;
}) {
  const { user } = await requireRole(...rolesFor("dispatch"));
  const sp = searchParams ? await searchParams : {};
  const initialOrderId = sp?.orderId ?? null;

  // Every approved or partly dispatched order: any logistics person may send it.
  const [rows, balances, recent, activeTrucks] = await Promise.all([
    db
      .select({
        id: orders.id,
        productId: orders.productId,
        bags: orders.bags,
        status: orders.status,
        deliverTo: orders.deliverTo,
        siteAddress: orders.siteAddress,
        receiverName: orders.receiverName,
        receiverPhone: orders.receiverPhone,
        requiredBy: orders.requiredBy,
        // Logistics and admin only (this page is staff): the staff note helps loading.
        staffNote: orders.staffNote,
        retailer: retailers.name,
        retailerAddress: retailers.address,
        retailerPlace: retailers.place,
        retailerPincode: retailers.pincode,
        retailerPhone: retailers.phone,
        product: products.name,
        ratePaise: orders.ratePaise,
        sent: sql<number>`coalesce((select sum(${dispatches.bags}) from ${dispatches} where ${dispatches.orderId} = ${orders.id}), 0)`.mapWith(Number),
      })
      .from(orders)
      .innerJoin(retailers, eq(orders.retailerId, retailers.id))
      .innerJoin(products, eq(orders.productId, products.id))
      .where(inArray(orders.status, ["approved", "partly_dispatched"]))
      .orderBy(asc(orders.createdAt))
      .limit(100),
    getBalances(),
    // Newest dispatches first: their truck and driver become chips in the sheet.
    db
      .select({ truck: vehicles.number, driverName: dispatches.driverName, driverPhone: dispatches.driverPhone })
      .from(dispatches)
      .innerJoin(vehicles, eq(vehicles.id, dispatches.vehicleId))
      // Loads only (a reversal row copies its load's truck, v2 B2); ignore hidden trucks.
      .where(and(gt(dispatches.bags, 0), eq(vehicles.active, true)))
      .orderBy(desc(dispatches.createdAt))
      .limit(30),
    getActiveTrucks(),
  ]);
  // The earliest "needed by" first (none last), then the oldest order first.
  const today = toISTDateKey(new Date());
  const pending = byRequiredBy(rows).map((r) => ({
    ...r,
    requiredByText: r.requiredBy ? formatDate(r.requiredBy) : null,
    late: isPastRequiredBy(r.requiredBy, today),
  }));
  // Places with stock history (godown still switched on), godowns first.
  // Trucks holding bags right now are listed under places.
  const loadedTrucks = new Set(balances.filter((b) => b.kind === "vehicle" && b.bags > 0).map((b) => b.placeKey));
  const loadedTruckNumbers = [...loadedTrucks]
    .map((k) => balances.find((b) => b.placeKey === k)?.placeName ?? "")
    .filter(Boolean);
  const chips = truckChips(
    loadedTruckNumbers,
    [
      ...activeTrucks.map((t) => ({ truck: t.number, driverName: t.driverName, driverPhone: t.driverPhone })),
      ...recent,
    ],
    Math.max(50, loadedTruckNumbers.length + activeTrucks.length + recent.length),
  );
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

  const loadedTruckVehicleIds = [...loadedTrucks]
    .map((k) => parsePlaceKey(k))
    .filter((ref): ref is { kind: "vehicle"; id: string } => ref?.kind === "vehicle")
    .map((ref) => ref.id);
  const truckInflows = await getVehicleInflowOrigins(loadedTruckVehicleIds);
  const placeSources: Record<string, string> = {};
  for (const b of balances) {
    if (!loadedTrucks.has(b.placeKey)) continue;
    const ref = parsePlaceKey(b.placeKey);
    if (ref?.kind !== "vehicle") continue;
    const key = `${b.placeKey}:${b.productId}`;
    const origin = resolveDispatchOrigin(
      {
        createdAt: new Date(),
        productId: b.productId,
        fromGodownId: null,
        fromVehicleId: ref.id,
        godownName: null,
        vehicleNumber: b.placeName,
      },
      truckInflows,
      new Map(),
    );
    placeSources[key] = origin.purchaseSource;
    if (!placeSources[b.placeKey]) placeSources[b.placeKey] = origin.purchaseSource;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Dispatch"
        action={
          can(user.role, "viewReports") ? (
            <Link href="/reports/sales" className="text-sm font-medium text-primary hover:underline">
              Sales report
            </Link>
          ) : undefined
        }
      />
      <DispatchView
        isAdmin={isAdmin(user.role)}
        orders={pending}
        places={places}
        placeSources={placeSources}
        truckChips={chips}
        loadedTrucks={loadedTruckNumbers}
        balances={balances.map((b) => ({ productId: b.productId, placeKey: b.placeKey, bags: b.bags }))}
        initialOrderId={initialOrderId}
      />
    </div>
  );
}
