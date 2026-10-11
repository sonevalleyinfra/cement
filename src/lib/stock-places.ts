import { asc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { godowns, stockMovements, vehicles } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { placeKey, type PlaceKind, type PlaceRef } from "@/lib/stock-rules";

/** An open database transaction. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type Place = { key: string; kind: PlaceKind; id: string; name: string; active: boolean };

/**
 * Places for the stock forms: every active godown (by name), then the trucks (by number)
 * that hold bags right now. Trucks are hired and typed each time, so empty ones are left out. Server-only.
 */
export async function getPlaces(): Promise<Place[]> {
  const [g, v] = await Promise.all([
    db
      .select({ id: godowns.id, name: godowns.name, active: godowns.active })
      .from(godowns)
      .where(eq(godowns.active, true))
      .orderBy(asc(godowns.name)),
    db
      .select({ id: vehicles.id, name: vehicles.number, active: vehicles.active })
      .from(vehicles)
      .innerJoin(stockMovements, eq(stockMovements.vehicleId, vehicles.id))
      .where(eq(vehicles.active, true))
      .groupBy(vehicles.id, vehicles.number, vehicles.active)
      .having(gt(sql`sum(${stockMovements.bags})`, 0))
      .orderBy(asc(vehicles.number)),
  ]);
  return [
    ...g.map((p) => ({ ...p, kind: "godown" as const, key: placeKey({ kind: "godown", id: p.id }) })),
    ...v.map((p) => ({ ...p, kind: "vehicle" as const, key: placeKey({ kind: "vehicle", id: p.id }) })),
  ];
}

/**
 * Locks the godown or truck for the rest of the transaction, so two people cannot take the
 * same bags at once and the place cannot be switched off while bags arrive.
 * Refused when the place is unknown or switched off.
 */
export async function lockPlace(
  tx: Tx,
  place: PlaceRef,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const [row] =
    place.kind === "godown"
      ? await tx
          .select({ name: godowns.name, active: godowns.active })
          .from(godowns)
          .where(eq(godowns.id, place.id))
          .for("no key update")
      : await tx
          .select({ name: vehicles.number, active: vehicles.active })
          .from(vehicles)
          .where(eq(vehicles.id, place.id))
          .for("no key update");
  if (!row || !row.active) return { ok: false, error: "Pick an active place." };
  return { ok: true, name: row.name };
}

/** Rows of one place: the godown or truck column matches (for `where`). */
export function atPlace(place: PlaceRef) {
  return place.kind === "godown" ? eq(stockMovements.godownId, place.id) : eq(stockMovements.vehicleId, place.id);
}

/** Bags at a godown or truck, every product together (for the switch-off check). */
export async function bagsAtPlace(tx: Tx, place: PlaceRef): Promise<number> {
  const [row] = await tx
    .select({ bags: sql<number>`coalesce(sum(${stockMovements.bags}), 0)`.mapWith(Number) })
    .from(stockMovements)
    .where(atPlace(place));
  return row?.bags ?? 0;
}

/**
 * The truck with this (already cleaned) number: made the first time it is typed, switched back on
 * if it was off. Nothing else is kept on it; the driver goes with each purchase or dispatch.
 */
export async function truckByNumber(tx: Tx, number: string, actorId: string): Promise<string> {
  const [made] = await tx
    .insert(vehicles)
    .values({ number, driverName: "" })
    .onConflictDoNothing({ target: vehicles.number })
    .returning({ id: vehicles.id });
  if (made) {
    await writeAudit(tx, { actorId, entity: "vehicle", entityId: made.id, action: "create", details: { number } });
    return made.id;
  }
  const [row] = await tx
    .update(vehicles)
    .set({ active: true, updatedAt: new Date() })
    .where(eq(vehicles.number, number))
    .returning({ id: vehicles.id });
  return row.id;
}
