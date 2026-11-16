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

/** Trucks visible in operational UI: active trucks holding bags (0-bag trucks stay in DB & reports only). */
export function activeLoadedTrucks<T extends TruckState>(trucks: readonly T[]): T[] {
  return trucks.filter(isLoaded);
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

export type Driver = { driverName: string; driverPhone: string };

/**
 * The driver typed on a purchase, dispatch or move, against the driver saved on the truck.
 * An empty name or phone keeps the saved one. Returns null when nothing changes, else the old and
 * new driver (written to the truck and to the activity log together).
 */
export function driverChange(
  saved: Driver,
  typed: { name?: string | null; phone?: string | null } | undefined,
): { from: Driver; to: Driver } | null {
  const name = (typed?.name ?? "").trim().slice(0, 80);
  const phone = (typed?.phone ?? "").trim().replace(/\D/g, "").slice(0, 15);
  const to: Driver = { driverName: name || saved.driverName, driverPhone: phone || saved.driverPhone };
  if (to.driverName === saved.driverName && to.driverPhone === saved.driverPhone) return null;
  return { from: { driverName: saved.driverName, driverPhone: saved.driverPhone }, to };
}
