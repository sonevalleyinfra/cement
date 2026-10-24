import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import { godowns, stockMovements, vehicles } from "@/db/schema";
import type { PlaceRef } from "@/lib/stock-rules";

// No `@/db` here: lib/reversals.ts (and its DB test) run these inside a given transaction.

/** An open transaction (or a database) on the app's schema. */
export type PlaceTx = Pick<PostgresJsDatabase<typeof schema>, "select">;

/**
 * Locks the godown or truck for the rest of the transaction, so two people cannot take the
 * same bags at once and the place cannot be switched off while bags arrive.
 * Refused when the place is unknown or switched off.
 */
export async function lockPlace(
  tx: PlaceTx,
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

