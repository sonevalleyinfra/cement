/**
 * Rules for the trucks list. Plain functions: no database, no request.
 * Only switched-on trucks count as loaded or standing; switched-off ones count in neither.
 */

type TruckState = { active: boolean; bags: number };

/** A switched-on truck with bags on it. */
export function isLoaded(t: TruckState): boolean {
  return t.active && t.bags > 0;
}

/** A switched-on truck with no bags on it. */
export function isStanding(t: TruckState): boolean {
  return t.active && t.bags === 0;
}

export function truckCounts(trucks: TruckState[]): { loaded: number; standing: number } {
  return {
    loaded: trucks.filter(isLoaded).length,
    standing: trucks.filter(isStanding).length,
  };
}

/** A truck with bags on it cannot be switched off: the bags would be lost from the stock. */
export function canSwitchOffTruck(bags: number): { ok: true } | { ok: false; error: string } {
  return bags > 0 ? { ok: false, error: "Unload the truck first" } : { ok: true };
}

/**
 * Adding a truck by number: a new number is created; a truck made automatically by a purchase or
 * dispatch (no driver name yet) gets its driver filled in; any other existing truck is a duplicate.
 */
export function truckSaveDecision(
  existing: { driverName: string; active: boolean } | null,
): "create" | "fill" | "duplicate" {
  if (!existing) return "create";
  return existing.driverName.trim() ? "duplicate" : "fill";
}
