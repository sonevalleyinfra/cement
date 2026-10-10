/**
 * Stock report as plain functions (no database).
 * Source: docs/idea.md sections 4 and 9 ("Stock = sum of movements per product per place";
 * "Stock: by product and by place (godowns + trucks)").
 *
 * For a date range, per product:
 *   opening (every movement before the range)
 *   + purchased − dispatched ± moved ± fixed  (movements in the range)
 *   = closing (every movement up to the end of the range, summed separately).
 * `reconciles` is false when the two ways disagree (for example a movement type this report
 * does not know); the screen flags it.
 *
 * Choices where the spec is silent:
 * - "Moved" = transfers between places; for one product they normally add up to 0.
 * - "Fixed" = admin corrections, plus opening stock entered during the range.
 * - "Dispatched" = bags sent to shops (minus any dispatch reversal), shown as a plus number.
 */
import { placeKey } from "./stock-rules";

export type StockMoveRow = {
  productId: string;
  godownId: string | null;
  vehicleId: string | null;
  type: string;
  /** Signed: + in, − out. */
  bags: number;
  createdAt: Date | string;
};

export type StockFlow = {
  productId: string;
  label: string;
  openingBags: number;
  purchasedBags: number;
  dispatchedBags: number;
  movedBags: number;
  fixedBags: number;
  closingBags: number;
  reconciles: boolean;
};

export type Names = ReadonlyMap<string, string>;

/** Opening, flows and closing per product for the range [start, end). Products with no rows up to `end` are left out. */
export function stockFlows(rows: readonly StockMoveRow[], range: { start: Date; end: Date }, productNames: Names): StockFlow[] {
  const start = range.start.getTime();
  const end = range.end.getTime();
  const flows = new Map<string, StockFlow>();
  for (const r of rows) {
    const t = new Date(r.createdAt).getTime();
    if (t >= end) continue;
    let f = flows.get(r.productId);
    if (!f) {
      f = {
        productId: r.productId,
        label: productNames.get(r.productId) ?? "Product",
        openingBags: 0,
        purchasedBags: 0,
        dispatchedBags: 0,
        movedBags: 0,
        fixedBags: 0,
        closingBags: 0,
        reconciles: true,
      };
      flows.set(r.productId, f);
    }
    f.closingBags += r.bags;
    if (t < start) {
      f.openingBags += r.bags;
      continue;
    }
    if (r.type === "purchase") f.purchasedBags += r.bags;
    else if (r.type === "dispatch" || r.type === "dispatch_reversal") f.dispatchedBags -= r.bags;
    else if (r.type === "transfer") f.movedBags += r.bags;
    else if (r.type === "adjustment" || r.type === "opening") f.fixedBags += r.bags;
    // Any other type is counted in closing only, so the row will not reconcile (and is flagged).
  }
  const out = [...flows.values()];
  for (const f of out) {
    f.reconciles = f.openingBags + f.purchasedBags - f.dispatchedBags + f.movedBags + f.fixedBags === f.closingBags;
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

/** Adds the flows of every product together (for the totals row). */
export function totalFlow(flows: readonly StockFlow[]): Omit<StockFlow, "productId" | "label"> {
  const t = { openingBags: 0, purchasedBags: 0, dispatchedBags: 0, movedBags: 0, fixedBags: 0, closingBags: 0, reconciles: true };
  for (const f of flows) {
    t.openingBags += f.openingBags;
    t.purchasedBags += f.purchasedBags;
    t.dispatchedBags += f.dispatchedBags;
    t.movedBags += f.movedBags;
    t.fixedBags += f.fixedBags;
    t.closingBags += f.closingBags;
    t.reconciles &&= f.reconciles;
  }
  return t;
}

export type PlaceStock = {
  key: string;
  kind: "godown" | "vehicle";
  label: string;
  bags: number;
  products: { productId: string; label: string; bags: number }[];
};

/**
 * Bags now (every movement), by product and by place. Places and products holding 0 bags are left out.
 * Godowns come first, then trucks, each by name.
 */
export function stockNow(
  rows: readonly Pick<StockMoveRow, "productId" | "godownId" | "vehicleId" | "bags">[],
  names: { products: Names; godowns: Names; vehicles: Names },
): { byProduct: { productId: string; label: string; bags: number }[]; byPlace: PlaceStock[]; totalBags: number } {
  const product = new Map<string, number>();
  const place = new Map<string, Map<string, number>>();
  for (const r of rows) {
    product.set(r.productId, (product.get(r.productId) ?? 0) + r.bags);
    const key = r.godownId ? placeKey({ kind: "godown", id: r.godownId }) : placeKey({ kind: "vehicle", id: r.vehicleId ?? "" });
    const m = place.get(key) ?? new Map<string, number>();
    m.set(r.productId, (m.get(r.productId) ?? 0) + r.bags);
    place.set(key, m);
  }
  const label = (id: string) => names.products.get(id) ?? "Product";
  const byProduct = [...product]
    .filter(([, bags]) => bags !== 0)
    .map(([productId, bags]) => ({ productId, label: label(productId), bags }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const byPlace: PlaceStock[] = [];
  for (const [key, m] of place) {
    const [kind, id] = key.split(":") as ["godown" | "vehicle", string];
    const products = [...m]
      .filter(([, bags]) => bags !== 0)
      .map(([productId, bags]) => ({ productId, label: label(productId), bags }))
      .sort((a, b) => a.label.localeCompare(b.label));
    if (products.length === 0) continue;
    const placeLabel = (kind === "godown" ? names.godowns : names.vehicles).get(id) ?? (kind === "godown" ? "Godown" : "Truck");
    byPlace.push({ key, kind, label: placeLabel, bags: products.reduce((n, p) => n + p.bags, 0), products });
  }
  byPlace.sort((a, b) => (a.kind === b.kind ? a.label.localeCompare(b.label) : a.kind === "godown" ? -1 : 1));
  return { byProduct, byPlace, totalBags: byProduct.reduce((n, p) => n + p.bags, 0) };
}
