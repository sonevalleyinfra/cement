/**
 * Damage and loss report as plain functions (no database).
 * Source: cement v2 plan C8 (L12): bags lost and their ₹ value, by reason and by place.
 *
 * - A loss is a stock correction (`type === "adjustment"`) with minus bags in the range [start, end).
 *   Plus corrections (a recount that found more bags) are not losses and are ignored here;
 *   they still show in the stock report as "Fixed".
 * - Value = bags × average purchase cost per bag of that product (purchases with a cost before the end of
 *   the range, see sales-report averageCostPerBag), whole paise only. "Landed cost" replaces this average
 *   once freight / invoice cost (L1) exists; until then it is the average purchase cost.
 * - A product with no known cost: its bags count in `unvaluedBags` and are left out of `valuePaise`.
 * - Reasons follow the STOCK_REASONS order; old corrections from before reason codes (0039) go in a
 *   last "Not given" group. Reasons with no entries are left out.
 */
import { reasonLabel, STOCK_REASONS } from "./reason-codes";
import { saleValuePaise } from "./sales-report";
import { placeKey } from "./stock-rules";
import type { Names } from "./stock-report";

export type LossRow = {
  productId: string;
  godownId: string | null;
  vehicleId: string | null;
  type: string;
  /** Signed: a loss is minus. */
  bags: number;
  reasonCode: string | null;
  createdAt: Date | string;
};

export type LossTotals = { bags: number; valuePaise: number; unvaluedBags: number; entries: number };
export type LossLine = LossTotals & { key: string; label: string };
export type PlaceLossLine = LossLine & { kind: "godown" | "vehicle" };

export type LossReport = { byReason: LossLine[]; byPlace: PlaceLossLine[]; total: LossTotals };

export const NOT_GIVEN = "Not given";

const empty = (): LossTotals => ({ bags: 0, valuePaise: 0, unvaluedBags: 0, entries: 0 });

function add(t: LossTotals, bags: number, value: number | null) {
  t.bags += bags;
  t.entries += 1;
  if (value === null) t.unvaluedBags += bags;
  else t.valuePaise += value;
}

/** Bags lost in the range and their value, by reason and by place. `costs` = average cost per bag (null = unknown). */
export function lossReport(
  rows: readonly LossRow[],
  range: { start: Date; end: Date },
  costs: ReadonlyMap<string, number | null>,
  names: { godowns: Names; vehicles: Names },
): LossReport {
  const start = range.start.getTime();
  const end = range.end.getTime();
  const reasons = new Map<string, LossLine>();
  const places = new Map<string, PlaceLossLine>();
  const total = empty();
  for (const r of rows) {
    if (r.type !== "adjustment" || r.bags >= 0) continue;
    const t = new Date(r.createdAt).getTime();
    if (t < start || t >= end) continue;
    const bags = -r.bags;
    const cost = costs.get(r.productId) ?? null;
    const value = cost === null ? null : saleValuePaise(bags, cost);

    const reasonKey = r.reasonCode ?? "";
    let reason = reasons.get(reasonKey);
    if (!reason) {
      reason = { key: reasonKey, label: reasonLabel(r.reasonCode, "stock") || (r.reasonCode ?? NOT_GIVEN), ...empty() };
      reasons.set(reasonKey, reason);
    }
    add(reason, bags, value);

    const kind = r.godownId ? "godown" : "vehicle";
    const id = r.godownId ?? r.vehicleId ?? "";
    const key = placeKey({ kind, id });
    let place = places.get(key);
    if (!place) {
      const label = (kind === "godown" ? names.godowns : names.vehicles).get(id) ?? (kind === "godown" ? "Godown" : "Truck");
      place = { key, kind, label, ...empty() };
      places.set(key, place);
    }
    add(place, bags, value);
    add(total, bags, value);
  }
  const order = new Map<string, number>(STOCK_REASONS.map((o, i) => [o.code, i]));
  // Known codes in list order, then any unknown code, then "Not given" last.
  const rank = (key: string) => (key === "" ? Infinity : (order.get(key) ?? STOCK_REASONS.length));
  const byReason = [...reasons.values()].sort((a, b) => rank(a.key) - rank(b.key) || a.label.localeCompare(b.label));
  const byPlace = [...places.values()].sort((a, b) => (a.kind === b.kind ? a.label.localeCompare(b.label) : a.kind === "godown" ? -1 : 1));
  return { byReason, byPlace, total };
}
