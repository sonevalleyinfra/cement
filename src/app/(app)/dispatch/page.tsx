import { asc, eq, inArray, sql } from "drizzle-orm";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { db } from "@/db";
import { dispatches, orders, products, retailers } from "@/db/schema";
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
import { getPlaces } from "@/lib/stock-places";
import { getActiveTrucks } from "@/lib/trucks";
import { cleanTruckLabel } from "@/lib/vehicle-rules";
import { DispatchView } from "./dispatch-view";

export default async function DispatchPage({
  searchParams,
}: {
  searchParams?: Promise<{ orderId?: string; truck?: string; vehicle?: string }>;
}) {
  const { user } = await requireRole(...rolesFor("dispatch"));
  const sp = searchParams ? await searchParams : {};
  const initialOrderId = sp?.orderId ?? null;
  const filterTruck = (sp?.truck || sp?.vehicle)?.trim() || null;

  // Every approved or partly dispatched order: any logistics person may send it.
  // Only currently loaded trucks (`bags > 0`) remain in active UI; 0-bag trucks stay in DB & reports only.
  const [rows, balances, activeTrucks, allPlaces] = await Promise.all([
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
        shopCreditStatus: retailers.creditStatus,
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
    getActiveTrucks(),
    getPlaces(),
  ]);
  // The earliest "needed by" first (none last), then the oldest order first.
  const today = toISTDateKey(new Date());
  let pending = byRequiredBy(rows).map((r) => ({
    ...r,
    requiredByText: r.requiredBy ? formatDate(r.requiredBy) : null,
    late: isPastRequiredBy(r.requiredBy, today),
  }));

  // When initiated from a specific loaded truck (?truck=...), only show orders matching products loaded on this truck
  if (filterTruck) {
    const truckBalances = balances.filter(
      (b) => b.kind === "vehicle" && b.bags > 0 && cleanTruckLabel(b.placeName) === cleanTruckLabel(filterTruck),
    );
    const truckProductIds = new Set(truckBalances.map((b) => b.productId));
    pending = pending.filter((r) => truckProductIds.has(r.productId));
  }

  // Places with stock history. All active godowns remain available even with filterTruck.
  const loadedTrucks = new Set(balances.filter((b) => b.kind === "vehicle" && b.bags > 0).map((b) => b.placeKey));
  const loadedTruckNumbers = [...loadedTrucks]
    .map((k) => balances.find((b) => b.placeKey === k)?.placeName ?? "")
    .filter(Boolean);
  const chips = truckChips(
    loadedTruckNumbers,
    activeTrucks.map((t) => ({ truck: t.number, driverName: t.driverName, driverPhone: t.driverPhone })),
    Math.max(50, loadedTruckNumbers.length + activeTrucks.length),
  );

  const placesMap = new Map<string, { key: string; name: string; truck: string | null }>();

  // 1. All active godowns (always included so Godown is always an option)
  for (const p of allPlaces) {
    if (p.kind === "godown" && p.active) {
      placesMap.set(p.key, {
        key: p.key,
        name: p.name,
        truck: null,
      });
    }
  }

  // 2. All loaded trucks from balances
  for (const b of balances) {
    if (b.placeActive && b.kind === "vehicle" && loadedTrucks.has(b.placeKey)) {
      placesMap.set(b.placeKey, {
        key: b.placeKey,
        name: `Truck ${b.placeName}`,
        truck: b.placeName,
      });
    }
  }

  const places = [...placesMap.values()].sort((a, b) =>
    (a.truck ? 1 : 0) - (b.truck ? 1 : 0) || a.name.localeCompare(b.name)
  );

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
        back="/more"
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
        filterTruck={filterTruck}
      />
    </div>
  );
}
