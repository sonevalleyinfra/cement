import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { godowns, stockMovements, vehicles } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { atPlace } from "@/lib/stock-place-lock";
import { placeKey, type PlaceKind, type PlaceRef } from "@/lib/stock-rules";

// Moved to stock-place-lock.ts (no `@/db`, so code that runs in a given transaction can use them).
export { atPlace, lockPlace } from "@/lib/stock-place-lock";

/** An open database transaction. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type Place = { key: string; kind: PlaceKind; id: string; name: string; active: boolean };

/**
 * Places for stock forms: every active godown (by name) and all active trucks (by number).
 * Server-only.
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
      .where(eq(vehicles.active, true))
      .orderBy(asc(vehicles.number)),
  ]);
  return [
    ...g.map((p) => ({ ...p, kind: "godown" as const, key: placeKey({ kind: "godown", id: p.id }) })),
    ...v.map((p) => ({ ...p, kind: "vehicle" as const, key: placeKey({ kind: "vehicle", id: p.id }) })),
  ];
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
 * if it was off.
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
