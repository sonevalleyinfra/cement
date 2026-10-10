/** Pure stock rules (no database). Stock is an append-only list of signed movements. */
import { isAdmin } from "./roles";

export const MOVEMENT_TYPES = ["opening", "purchase", "dispatch", "adjustment", "transfer"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export type Movement = {
  productId: string;
  /** The godown or truck, as a place key ("godown:<id>" / "vehicle:<id>", see `placeKey`). */
  placeKey: string;
  type: MovementType;
  /** Signed: + adds bags, - removes bags. */
  bags: number;
  orderId?: string | null;
  reason?: string;
};

export type StockKey = { productId: string; placeKey: string };

/** Bags of one product at one place. */
export function balance(movements: readonly Movement[], key: StockKey): number {
  let total = 0;
  for (const m of movements) {
    if (m.productId === key.productId && m.placeKey === key.placeKey) total += m.bags;
  }
  return total;
}

export function isPositiveBags(bags: number): boolean {
  return Number.isInteger(bags) && bags > 0;
}

/**
 * Largest number of bags one stock entry (purchase, opening, adjustment) may move.
 * Guards typos like 10000000 and keeps sums inside the database integer range.
 */
export const MAX_STOCK_ENTRY_BAGS = 100000;

/** Can we take `bags` out? Needs whole bags, > 0, and enough in stock. */
export function canDispatch(
  currentBalance: number,
  bags: number,
): { ok: true } | { ok: false; error: string } {
  if (!isPositiveBags(bags)) return { ok: false, error: "Bags must be a whole number above zero." };
  if (currentBalance < bags) {
    return { ok: false, error: `Only ${Math.max(currentBalance, 0)} bags in stock.` };
  }
  return { ok: true };
}

/** Why stock was corrected (spec section 4): picked from this list, with an optional note. */
export const STOCK_FIX_REASONS = ["damage", "burst", "shortage", "count"] as const;
export type StockFixReason = (typeof STOCK_FIX_REASONS)[number];

export const STOCK_FIX_LABELS: Record<StockFixReason, string> = {
  damage: "Damage",
  burst: "Burst bags",
  shortage: "Shortage",
  count: "Count",
};

export function isStockFixReason(value: unknown): value is StockFixReason {
  return typeof value === "string" && (STOCK_FIX_REASONS as readonly string[]).includes(value);
}

/** The reason text kept on the correction: "Damage" or "Damage: rain in godown" (200 characters at most). */
export function stockFixText(reason: StockFixReason, note: string | null | undefined): string {
  const clean = String(note ?? "").trim().replace(/\s+/g, " ");
  return (clean ? `${STOCK_FIX_LABELS[reason]}: ${clean}` : STOCK_FIX_LABELS[reason]).slice(0, 200);
}

/** Admin-only correction: a reason from the list (damage, burst, shortage, count) and an optional note. */
export function adjustmentMovement(
  movements: readonly Movement[],
  key: StockKey,
  deltaBags: number,
  reason: unknown,
  note: string | null | undefined,
  role: string | null | undefined,
): { ok: true; movement: Movement } | { ok: false; error: string } {
  if (!isAdmin(role)) return { ok: false, error: "Only an admin can adjust stock." };
  if (!Number.isInteger(deltaBags) || deltaBags === 0) {
    return { ok: false, error: "Adjustment must be a whole number other than zero." };
  }
  if (Math.abs(deltaBags) > MAX_STOCK_ENTRY_BAGS) return { ok: false, error: "That is too many bags." };
  if (!isStockFixReason(reason)) return { ok: false, error: "Pick a reason." };
  if (balance(movements, key) + deltaBags < 0) {
    return { ok: false, error: "Stock cannot go below zero." };
  }
  return { ok: true, movement: { ...key, type: "adjustment", bags: deltaBags, reason: stockFixText(reason, note) } };
}

/** Moves bags between two places (e.g. leftover bags back to the godown, loading a truck). */
export function transferMovements(
  movements: readonly Movement[],
  from: StockKey,
  toPlaceKey: string,
  bags: number,
  reason = "",
): { ok: true; movements: [Movement, Movement] } | { ok: false; error: string } {
  if (from.placeKey === toPlaceKey) return { ok: false, error: "Pick two different places." };
  if (Number.isInteger(bags) && bags > MAX_STOCK_ENTRY_BAGS) return { ok: false, error: "That is too many bags." };
  const check = canDispatch(balance(movements, from), bags);
  if (!check.ok) return check;
  return {
    ok: true,
    movements: [
      { ...from, type: "transfer", bags: -bags, reason },
      { ...from, placeKey: toPlaceKey, type: "transfer", bags, reason },
    ],
  };
}

/** The place value for "New truck…" (purchase, move bags): the truck number and driver are typed in. */
export const NEW_TRUCK_PLACE = "new-truck";

/**
 * The two places of a move. "From" must be a place that exists (a godown or a loaded truck);
 * "To" may also be `NEW_TRUCK_PLACE` (a hired truck typed in the form), so bags can be loaded
 * onto a truck even when there is only one godown.
 */
export function checkTransferPlaces(
  fromKey: unknown,
  toKey: unknown,
): { ok: true; from: PlaceRef; to: PlaceRef | typeof NEW_TRUCK_PLACE } | { ok: false; error: string } {
  const from = parsePlaceKey(fromKey);
  const to = toKey === NEW_TRUCK_PLACE ? NEW_TRUCK_PLACE : parsePlaceKey(toKey);
  if (!from || !to) return { ok: false, error: "Pick where the bags are and where they go." };
  if (to !== NEW_TRUCK_PLACE && placeKey(from) === placeKey(to)) return { ok: false, error: "Pick two different places." };
  return { ok: true, from, to };
}

/** Purchase and opening stock add bags (admin entry; caller checks admin). */
export function inMovement(
  type: "purchase" | "opening",
  key: StockKey,
  bags: number,
  reason = "",
): { ok: true; movement: Movement } | { ok: false; error: string } {
  if (!isPositiveBags(bags)) return { ok: false, error: "Bags must be a whole number above zero." };
  if (bags > MAX_STOCK_ENTRY_BAGS) return { ok: false, error: "That is too many bags." };
  return { ok: true, movement: { ...key, type, bags, reason } };
}

/** Opening stock is set once per product + place. A second one must be an adjustment. */
export function canSetOpening(
  movements: readonly Movement[],
  key: StockKey,
): { ok: true } | { ok: false; error: string } {
  const done = movements.some(
    (m) => m.type === "opening" && m.productId === key.productId && m.placeKey === key.placeKey,
  );
  return done
    ? { ok: false, error: "Opening stock is already set here. Use an adjustment to change it." }
    : { ok: true };
}

/** Clean a godown name: single spaces, max 60 chars, not empty. */
export function cleanLocationName(name: string): string | null {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 60);
  return clean || null;
}

/** The two kinds of place where bags can be. */
export const PLACE_KINDS = ["godown", "vehicle"] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];
export type PlaceRef = { kind: PlaceKind; id: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One text value for a place in a drop-down: "godown:<id>" or "vehicle:<id>". */
export function placeKey(place: PlaceRef): string {
  return `${place.kind}:${place.id}`;
}

/** Reads a place key back. Null when it is not a valid one. */
export function parsePlaceKey(text: unknown): PlaceRef | null {
  if (typeof text !== "string") return null;
  const [kind, id, extra] = text.split(":");
  if (extra !== undefined || !(PLACE_KINDS as readonly string[]).includes(kind) || !UUID_RE.test(id ?? "")) return null;
  return { kind: kind as PlaceKind, id: id.toLowerCase() };
}

/**
 * The database columns for a place key: a godown fills `godownId`, a truck fills `vehicleId`
 * (the other one stays empty). Throws on a key that is not a place.
 */
export function placeColumns(key: string): { godownId: string | null; vehicleId: string | null } {
  const place = parsePlaceKey(key);
  if (!place) throw new Error("Unknown place");
  return place.kind === "godown" ? { godownId: place.id, vehicleId: null } : { godownId: null, vehicleId: place.id };
}

/** A godown or vehicle can be switched off only when it holds no bags. */
export function canSwitchOffPlace(bagsThere: number): { ok: true } | { ok: false; error: string } {
  return bagsThere > 0 ? { ok: false, error: "Move the bags out first." } : { ok: true };
}

/** Places for a drop-down, in Godowns / Trucks sections (empty sections left out). Keeps the given order. */
export function placeGroups(
  places: readonly { key: string; kind: string; name: string }[],
): { label: string; options: { value: string; label: string }[] }[] {
  return [
    { label: "Godowns", kind: "godown" },
    { label: "Trucks", kind: "vehicle" },
  ]
    .map((g) => ({
      label: g.label,
      options: places.filter((p) => p.kind === g.kind).map((p) => ({ value: p.key, label: p.name })),
    }))
    .filter((g) => g.options.length > 0);
}
