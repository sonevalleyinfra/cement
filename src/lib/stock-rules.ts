/** Pure stock rules (no database). Stock is an append-only list of signed movements. */
import { isAdmin } from "@/lib/roles";

export const MOVEMENT_TYPES = [
  "opening",
  "purchase",
  "dispatch",
  "dispatch_reversal",
  "adjustment",
  "transfer",
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export type Movement = {
  firmId: string;
  productId: string;
  locationId: string;
  type: MovementType;
  /** Signed: + adds bags, - removes bags. */
  bags: number;
  orderId?: string | null;
  reason?: string;
};

export type StockKey = { firmId: string; productId: string; locationId: string };

/** Bags for one firm + product + location. Other firms' movements are ignored. */
export function balance(movements: readonly Movement[], key: StockKey): number {
  let total = 0;
  for (const m of movements) {
    if (m.firmId === key.firmId && m.productId === key.productId && m.locationId === key.locationId) {
      total += m.bags;
    }
  }
  return total;
}

/** Bags for one firm + product across all locations. */
export function firmProductTotal(
  movements: readonly Movement[],
  firmId: string,
  productId: string,
): number {
  let total = 0;
  for (const m of movements) if (m.firmId === firmId && m.productId === productId) total += m.bags;
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

/** Can we take `bags` out? Needs whole bags, > 0, and enough in this firm's stock. */
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

/** Builds the dispatch movement (negative). Throws if stock is not enough. */
export function dispatchMovement(
  movements: readonly Movement[],
  key: StockKey,
  bags: number,
  orderId: string,
): Movement {
  const check = canDispatch(balance(movements, key), bags);
  if (!check.ok) throw new Error(check.error);
  return { ...key, type: "dispatch", bags: -bags, orderId };
}

/** Admin-only adjustment (damage, burst, shortage, physical count). Reason is required. */
export function adjustmentMovement(
  movements: readonly Movement[],
  key: StockKey,
  deltaBags: number,
  reason: string,
  role: string | null | undefined,
): { ok: true; movement: Movement } | { ok: false; error: string } {
  if (!isAdmin(role)) return { ok: false, error: "Only an admin can adjust stock." };
  if (!Number.isInteger(deltaBags) || deltaBags === 0) {
    return { ok: false, error: "Adjustment must be a whole number other than zero." };
  }
  if (Math.abs(deltaBags) > MAX_STOCK_ENTRY_BAGS) return { ok: false, error: "That is too many bags." };
  const why = reason.trim();
  if (!why) return { ok: false, error: "A reason is required." };
  if (balance(movements, key) + deltaBags < 0) {
    return { ok: false, error: "Stock cannot go below zero." };
  }
  return { ok: true, movement: { ...key, type: "adjustment", bags: deltaBags, reason: why } };
}

/** Moves bags between two locations of the SAME firm (e.g. leftover bags back to godown). */
export function transferMovements(
  movements: readonly Movement[],
  from: StockKey,
  toLocationId: string,
  bags: number,
  reason = "",
): { ok: true; movements: [Movement, Movement] } | { ok: false; error: string } {
  if (from.locationId === toLocationId) return { ok: false, error: "Pick two different places." };
  if (Number.isInteger(bags) && bags > MAX_STOCK_ENTRY_BAGS) return { ok: false, error: "That is too many bags." };
  const check = canDispatch(balance(movements, from), bags);
  if (!check.ok) return check;
  return {
    ok: true,
    movements: [
      { ...from, type: "transfer", bags: -bags, reason },
      { ...from, locationId: toLocationId, type: "transfer", bags, reason },
    ],
  };
}

/** What we know about a place when checking a transfer. */
export type PlaceInfo = { firmId: string; active: boolean };

/** Both places must exist, belong to this firm and be active. */
export function checkTransferPlaces(
  firmId: string,
  from: PlaceInfo | undefined,
  to: PlaceInfo | undefined,
): { ok: true } | { ok: false; error: string } {
  const good = (p: PlaceInfo | undefined) => !!p && p.firmId === firmId && p.active;
  if (!good(from) || !good(to)) return { ok: false, error: "Pick active places of this firm." };
  return { ok: true };
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

/** Opening stock is set once per firm + product + location. A second one must be an adjustment. */
export function canSetOpening(
  movements: readonly Movement[],
  key: StockKey,
): { ok: true } | { ok: false; error: string } {
  const done = movements.some(
    (m) =>
      m.type === "opening" &&
      m.firmId === key.firmId &&
      m.productId === key.productId &&
      m.locationId === key.locationId,
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
