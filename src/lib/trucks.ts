import { and, asc, eq, gt, gte, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { dispatches, products, stockMovements, vehicles } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { isUniqueViolation } from "@/lib/db-errors";
import { canSwitchOffTruck, truckSaveDecision } from "@/lib/truck-rules";
import { checkTruck } from "@/lib/vehicle-rules";

export type TruckProduct = {
  productId: string;
  name: string;
  bags: number;
};

export type TruckRow = {
  id: string;
  number: string;
  driverName: string;
  driverPhone: string;
  active: boolean;
  bags: number;
  products?: TruckProduct[];
};

/** Every vehicle in the system, with current loaded bags. Server-only. */
export async function getTrucks(): Promise<TruckRow[]> {
  const effectiveDriverName = sql<string>`coalesce(
    nullif(${vehicles.driverName}, ''),
    (select p.driver_name from purchases p where p.truck_number = ${vehicles.number} and p.driver_name <> '' order by p.created_at desc limit 1),
    (select d.driver_name from dispatches d where d.vehicle_id = ${vehicles.id} and d.driver_name <> '' order by d.created_at desc limit 1),
    ''
  )`;
  const effectiveDriverPhone = sql<string>`coalesce(
    nullif(${vehicles.driverPhone}, ''),
    (select p.driver_phone from purchases p where p.truck_number = ${vehicles.number} and p.driver_phone <> '' order by p.created_at desc limit 1),
    (select d.driver_phone from dispatches d where d.vehicle_id = ${vehicles.id} and d.driver_phone <> '' order by d.created_at desc limit 1),
    ''
  )`;

  const [rows, productRows] = await Promise.all([
    db
      .select({
        id: vehicles.id,
        number: vehicles.number,
        driverName: effectiveDriverName,
        driverPhone: effectiveDriverPhone,
        active: vehicles.active,
        bags: sql<number>`coalesce(sum(${stockMovements.bags}), 0)`.mapWith(Number),
      })
      .from(vehicles)
      .leftJoin(stockMovements, eq(stockMovements.vehicleId, vehicles.id))
      .groupBy(vehicles.id, vehicles.number, vehicles.driverName, vehicles.driverPhone, vehicles.active)
      .orderBy(asc(vehicles.number)),
    db
      .select({
        vehicleId: stockMovements.vehicleId,
        productId: stockMovements.productId,
        name: products.name,
        bags: sql<number>`coalesce(sum(${stockMovements.bags}), 0)`.mapWith(Number),
      })
      .from(stockMovements)
      .innerJoin(products, eq(products.id, stockMovements.productId))
      .where(isNotNull(stockMovements.vehicleId))
      .groupBy(stockMovements.vehicleId, stockMovements.productId, products.name),
  ]);

  const productsByVehicle = new Map<string, TruckProduct[]>();
  for (const pr of productRows) {
    if (!pr.vehicleId || pr.bags <= 0) continue;
    const list = productsByVehicle.get(pr.vehicleId) ?? [];
    list.push({ productId: pr.productId, name: pr.name, bags: pr.bags });
    productsByVehicle.set(pr.vehicleId, list);
  }

  return rows.map((r) => {
    const prods = (productsByVehicle.get(r.id) ?? []).sort((a, b) => b.bags - a.bags || a.name.localeCompare(b.name));
    return {
      ...r,
      bags: Math.max(r.bags, 0),
      products: prods,
    };
  });
}

/** Active loaded trucks list (`bags > 0`) for operational dropdowns and auto-fill. */
export async function getActiveTrucks(): Promise<{ number: string; driverName: string; driverPhone: string }[]> {
  const effectiveDriverName = sql<string>`coalesce(
    nullif(${vehicles.driverName}, ''),
    (select p.driver_name from purchases p where p.truck_number = ${vehicles.number} and p.driver_name <> '' order by p.created_at desc limit 1),
    (select d.driver_name from dispatches d where d.vehicle_id = ${vehicles.id} and d.driver_name <> '' order by d.created_at desc limit 1),
    ''
  )`;
  const effectiveDriverPhone = sql<string>`coalesce(
    nullif(${vehicles.driverPhone}, ''),
    (select p.driver_phone from purchases p where p.truck_number = ${vehicles.number} and p.driver_phone <> '' order by p.created_at desc limit 1),
    (select d.driver_phone from dispatches d where d.vehicle_id = ${vehicles.id} and d.driver_phone <> '' order by d.created_at desc limit 1),
    ''
  )`;

  return db
    .select({
      number: vehicles.number,
      driverName: effectiveDriverName,
      driverPhone: effectiveDriverPhone,
    })
    .from(vehicles)
    .leftJoin(stockMovements, eq(stockMovements.vehicleId, vehicles.id))
    .where(eq(vehicles.active, true))
    .groupBy(vehicles.id, vehicles.number, vehicles.driverName, vehicles.driverPhone)
    .having(sql`coalesce(sum(${stockMovements.bags}), 0) > 0`)
    .orderBy(asc(vehicles.number));
}

/** Dispatches with bags made since `start` (e.g. the start of today in IST). Server-only. */
export async function countDispatchedSince(start: Date): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(dispatches)
    .where(and(gt(dispatches.bags, 0), gte(dispatches.createdAt, start)));
  return row?.count ?? 0;
}

export type TruckResult = { ok: true; id?: string } | { ok: false; error: string };

const duplicate = (number: string, active = true): TruckResult => ({
  ok: false,
  error: `Truck ${number} is already in the list${active ? "" : " (hidden)"}`,
});

/**
 * Adds a truck. A truck made automatically by a purchase or dispatch (no driver yet) gets its driver
 * filled in; any other truck with the same number is refused (see `truckSaveDecision`).
 */
export async function saveTruck(
  input: { number: string; driverName: string; driverPhone?: string },
  actorId: string,
): Promise<TruckResult> {
  const check = checkTruck(input, { phoneRequired: false });
  if (!check.ok) return check;
  const truck = check.value;

  try {
    return await db.transaction(async (tx): Promise<TruckResult> => {
      const [existing] = await tx
        .select({
          id: vehicles.id,
          driverName: vehicles.driverName,
          driverPhone: vehicles.driverPhone,
          active: vehicles.active,
        })
        .from(vehicles)
        .where(eq(vehicles.number, truck.number))
        .for("update");

      const decision = truckSaveDecision(existing ?? null);
      if (decision === "duplicate") return duplicate(truck.number, existing.active);

      if (decision === "fill") {
        await tx
          .update(vehicles)
          .set({
            driverName: truck.driverName,
            driverPhone: truck.driverPhone,
            active: true,
            updatedAt: new Date(),
          })
          .where(eq(vehicles.id, existing.id));
        await writeAudit(tx, {
          actorId,
          entity: "vehicle",
          entityId: existing.id,
          action: "update",
          details: {
            number: truck.number,
            from: {
              driverName: existing.driverName,
              driverPhone: existing.driverPhone,
              active: existing.active,
            },
            to: { driverName: truck.driverName, driverPhone: truck.driverPhone, active: true },
          },
        });
        return { ok: true, id: existing.id };
      }

      const [made] = await tx
        .insert(vehicles)
        .values({ number: truck.number, driverName: truck.driverName, driverPhone: truck.driverPhone, active: true })
        .returning({ id: vehicles.id });
      await writeAudit(tx, {
        actorId,
        entity: "vehicle",
        entityId: made.id,
        action: "create",
        details: { number: truck.number, driverName: truck.driverName, driverPhone: truck.driverPhone },
      });
      return { ok: true, id: made.id };
    });
  } catch (e) {
    // Another request added the same number between our check and insert.
    if (isUniqueViolation(e)) return duplicate(truck.number);
    throw e;
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Per product, so one product's minus balance cannot hide another's bags. */
async function maxProductBagsOnTruck(tx: Tx, vehicleId: string): Promise<number> {
  const stock = await tx
    .select({ bags: sql<number>`coalesce(sum(${stockMovements.bags}), 0)`.mapWith(Number) })
    .from(stockMovements)
    .where(eq(stockMovements.vehicleId, vehicleId))
    .groupBy(stockMovements.productId);
  return Math.max(0, ...stock.map((s) => s.bags));
}

/** Updates a truck's number, driver name and driver phone. Refuses duplicate numbers. Server-only. */
export async function updateTruck(
  id: string,
  input: { number: string; driverName: string; driverPhone?: string },
  actorId: string,
): Promise<TruckResult> {
  const check = checkTruck(input, { phoneRequired: false });
  if (!check.ok) return check;
  const truck = check.value;

  try {
    return await db.transaction(async (tx): Promise<TruckResult> => {
      const [row] = await tx
        .select({
          number: vehicles.number,
          driverName: vehicles.driverName,
          driverPhone: vehicles.driverPhone,
        })
        .from(vehicles)
        .where(eq(vehicles.id, id))
        .for("update");
      if (!row) return { ok: false, error: "Truck not found" };

      const [other] = await tx
        .select({ id: vehicles.id, active: vehicles.active })
        .from(vehicles)
        .where(and(ne(vehicles.id, id), eq(vehicles.number, truck.number)))
        .limit(1);
      if (other) return duplicate(truck.number, other.active);

      await tx
        .update(vehicles)
        .set({
          number: truck.number,
          driverName: truck.driverName,
          driverPhone: truck.driverPhone,
          updatedAt: new Date(),
        })
        .where(eq(vehicles.id, id));
      await writeAudit(tx, {
        actorId,
        entity: "vehicle",
        entityId: id,
        action: "update",
        details: {
          from: { number: row.number, driverName: row.driverName, driverPhone: row.driverPhone },
          to: { number: truck.number, driverName: truck.driverName, driverPhone: truck.driverPhone },
        },
      });
      return { ok: true, id };
    });
  } catch (e) {
    if (isUniqueViolation(e)) return duplicate(truck.number);
    throw e;
  }
}

/** Hides (`active: false`) or unhides (`active: true`) a truck. A truck with bags on it cannot be hidden. Server-only. */
export async function switchTruck(id: string, active: boolean, actorId: string): Promise<TruckResult> {
  return db.transaction(async (tx): Promise<TruckResult> => {
    const [row] = await tx
      .select({ number: vehicles.number, active: vehicles.active })
      .from(vehicles)
      .where(eq(vehicles.id, id))
      .for("update");
    if (!row) return { ok: false, error: "Truck not found" };
    if (row.active === active) return { ok: true, id };

    if (!active) {
      const can = canSwitchOffTruck(await maxProductBagsOnTruck(tx, id));
      if (!can.ok) return can;
    }

    await tx.update(vehicles).set({ active, updatedAt: new Date() }).where(eq(vehicles.id, id));
    await writeAudit(tx, {
      actorId,
      entity: "vehicle",
      entityId: id,
      action: active ? "activate" : "deactivate",
      details: { number: row.number },
    });
    return { ok: true, id };
  });
}
