import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { stockMovements, vehicles } from "@/db/schema";
import { checkTruck, type Truck } from "@/lib/vehicle-rules";
import { writeAudit } from "@/lib/audit";

export type TruckRow = {
  id: string;
  number: string;
  driverName: string;
  driverPhone: string;
  active: boolean;
  bags: number;
};

/** Every vehicle in the system, with current loaded bags. Server-only. */
export async function getTrucks(): Promise<TruckRow[]> {
  try {
    const rows = await db
      .select({
        id: vehicles.id,
        number: vehicles.number,
        driverName: vehicles.driverName,
        driverPhone: vehicles.driverPhone,
        active: vehicles.active,
        bags: sql<number>`coalesce(sum(${stockMovements.bags}), 0)`.mapWith(Number),
      })
      .from(vehicles)
      .leftJoin(stockMovements, eq(stockMovements.vehicleId, vehicles.id))
      .groupBy(vehicles.id, vehicles.number, vehicles.driverName, vehicles.driverPhone, vehicles.active)
      .orderBy(asc(vehicles.number));

    return rows.map((r) => ({
      ...r,
      bags: Math.max(r.bags, 0),
    }));
  } catch (error) {
    console.error("getTrucks error:", error);
    return [];
  }
}

/** Active trucks list for dropdowns and auto-fill. */
export async function getActiveTrucks(): Promise<{ number: string; driverName: string; driverPhone: string }[]> {
  try {
    const rows = await db
      .select({
        number: vehicles.number,
        driverName: vehicles.driverName,
        driverPhone: vehicles.driverPhone,
      })
      .from(vehicles)
      .where(eq(vehicles.active, true))
      .orderBy(asc(vehicles.number));

    return rows;
  } catch (error) {
    console.error("getActiveTrucks error:", error);
    return [];
  }
}

export type TruckResult = { ok: true; id?: string } | { ok: false; error: string };

/** Adds a new truck or updates driver details if it already exists. */
export async function saveTruck(
  input: { number: string; driverName: string; driverPhone?: string },
  actorId: string,
): Promise<TruckResult> {
  const check = checkTruck(input, { phoneRequired: false });
  if (!check.ok) return check;
  const truck = check.value;

  try {
    const [saved] = await db
      .insert(vehicles)
      .values({
        number: truck.number,
        driverName: truck.driverName,
        driverPhone: truck.driverPhone,
        active: true,
      })
      .onConflictDoUpdate({
        target: vehicles.number,
        set: {
          driverName: truck.driverName,
          driverPhone: truck.driverPhone,
          active: true,
          updatedAt: new Date(),
        },
      })
      .returning({ id: vehicles.id });

    await writeAudit(db, {
      actorId,
      entity: "vehicle",
      entityId: saved.id,
      action: "create",
      details: { number: truck.number, driverName: truck.driverName, driverPhone: truck.driverPhone },
    });

    return { ok: true, id: saved.id };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to save truck";
    return { ok: false, error: msg };
  }
}
