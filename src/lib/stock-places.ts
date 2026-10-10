import { and, asc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { godowns, stockLocations, stockMovements, vehicles } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { placeKey, type PlaceKind, type PlaceRef } from "@/lib/stock-rules";

/** An open database transaction. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type Place = { key: string; kind: PlaceKind; id: string; name: string; active: boolean };

/**
 * Places for a firm's stock forms: every active godown (by name), then the trucks (by number)
 * that hold this firm's bags right now. Trucks are hired and typed each time, so empty ones are left out. Server-only.
 */
export async function getPlaces({ firmId }: { firmId: string }): Promise<Place[]> {
  const [g, v] = await Promise.all([
    db
      .select({ id: godowns.id, name: godowns.name, active: godowns.active })
      .from(godowns)
      .where(eq(godowns.active, true))
      .orderBy(asc(godowns.name)),
    db
      .select({ id: vehicles.id, name: vehicles.number, active: vehicles.active })
      .from(vehicles)
      .innerJoin(stockLocations, and(eq(stockLocations.vehicleId, vehicles.id), eq(stockLocations.firmId, firmId)))
      .innerJoin(stockMovements, eq(stockMovements.locationId, stockLocations.id))
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
 * This firm's stock row at a place, made the first time it is needed, and locked for the
 * rest of the transaction. The godown / vehicle itself is share-locked so it cannot be
 * switched off while bags arrive. Refused when the place is unknown or switched off.
 */
export async function getLocation(
  tx: Tx,
  firmId: string,
  place: PlaceRef,
): Promise<{ ok: true; locationId: string; name: string } | { ok: false; error: string }> {
  const [master] =
    place.kind === "godown"
      ? await tx
          .select({ name: godowns.name, active: godowns.active })
          .from(godowns)
          .where(eq(godowns.id, place.id))
          .for("share")
      : await tx
          .select({ name: vehicles.number, active: vehicles.active })
          .from(vehicles)
          .where(eq(vehicles.id, place.id))
          .for("share");
  if (!master || !master.active) return { ok: false, error: "Pick an active place." };
  const isGodown = place.kind === "godown";
  await tx
    .insert(stockLocations)
    .values({
      firmId,
      kind: place.kind,
      name: master.name,
      godownId: isGodown ? place.id : null,
      vehicleId: isGodown ? null : place.id,
    })
    .onConflictDoNothing();
  const [loc] = await tx
    .select({ id: stockLocations.id })
    .from(stockLocations)
    .where(
      and(
        eq(stockLocations.firmId, firmId),
        isGodown ? eq(stockLocations.godownId, place.id) : eq(stockLocations.vehicleId, place.id),
      ),
    )
    .for("no key update");
  return { ok: true, locationId: loc.id, name: master.name };
}

/** Bags at a godown or vehicle, all firms together (for the switch-off check). */
export async function bagsAtPlace(tx: Tx, place: PlaceRef): Promise<number> {
  const [row] = await tx
    .select({ bags: sql<number>`coalesce(sum(${stockMovements.bags}), 0)`.mapWith(Number) })
    .from(stockMovements)
    .innerJoin(stockLocations, eq(stockLocations.id, stockMovements.locationId))
    .where(place.kind === "godown" ? eq(stockLocations.godownId, place.id) : eq(stockLocations.vehicleId, place.id));
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
