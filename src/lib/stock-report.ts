/**
 * Stock report as plain functions (no database).
 * Source: docs/idea.md sections 4 and 9 ("Stock = sum of movements per product per place";
 * "Stock: by product and by place (godowns + trucks)").
 *
 * For a date range, per product:
 *   opening (every movement before the range: the "Start" column)
 *   + opening stock entered + purchased − dispatched ± moved ± fixed  (movements in the range)
 *   = closing (every movement up to the end of the range, summed separately: the "End" column).
 * `reconciles` is false when the two ways disagree (for example a movement type this report
 * does not know); the screen flags it.
 *
 * Choices where the spec is silent:
 * - "± moved" = transfers between places; for one product the net is normally 0, so the screen shows
 *   bags moved in and out (godown↔truck) instead of the net.
 * - "Opening" = opening stock entered during the range (a first count of a place), shown apart
 *   from "Fixed" = admin corrections (damage, burst, shortage, count).
 * - "Dispatched" = bags sent to shops, shown as a plus number.
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
  /** Opening stock entered during the range (not a correction). */
  openingStockBags: number;
  purchasedBags: number;
  dispatchedBags: number;
  movedBags: number;
  /** Bags that arrived in a place by a transfer (a plus number). Net `movedBags` is 0 per product, so this shows the move. */
  movedInBags: number;
  /** Bags that left a place by a transfer (a plus number). */
  movedOutBags: number;
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
        openingStockBags: 0,
        purchasedBags: 0,
        dispatchedBags: 0,
        movedBags: 0,
        movedInBags: 0,
        movedOutBags: 0,
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
    else if (r.type === "dispatch") f.dispatchedBags -= r.bags;
    else if (r.type === "transfer") {
      f.movedBags += r.bags;
      if (r.bags > 0) f.movedInBags += r.bags;
      else f.movedOutBags -= r.bags;
    }
    else if (r.type === "opening") f.openingStockBags += r.bags;
    else if (r.type === "adjustment") f.fixedBags += r.bags;
    // Any other type is counted in closing only, so the row will not reconcile (and is flagged).
  }
  const out = [...flows.values()];
  for (const f of out) {
    f.reconciles =
      f.openingBags + f.openingStockBags + f.purchasedBags - f.dispatchedBags + f.movedBags + f.fixedBags === f.closingBags;
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

/** Adds the flows of every product together (for the totals row). */
export function totalFlow(flows: readonly StockFlow[]): Omit<StockFlow, "productId" | "label"> {
  const t = {
    openingBags: 0,
    openingStockBags: 0,
    purchasedBags: 0,
    dispatchedBags: 0,
    movedBags: 0,
    movedInBags: 0,
    movedOutBags: 0,
    fixedBags: 0,
    closingBags: 0,
    reconciles: true,
  };
  for (const f of flows) {
    t.openingBags += f.openingBags;
    t.openingStockBags += f.openingStockBags;
    t.purchasedBags += f.purchasedBags;
    t.dispatchedBags += f.dispatchedBags;
    t.movedBags += f.movedBags;
    t.movedInBags += f.movedInBags;
    t.movedOutBags += f.movedOutBags;
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

export type PlaceFlow = {
  key: string;
  kind: "godown" | "vehicle";
  label: string;
  /** Every movement in this place before the range. */
  openingBags: number;
  /** In the range: purchase + opening stock + transfer in + plus corrections. */
  inBags: number;
  /** In the range, as a plus number: dispatch + transfer out + minus corrections. */
  outBags: number;
  /** Every movement in this place before the end of the range, summed separately. */
  closingBags: number;
  /** opening + in − out === closing. False only for a movement type this report does not know. */
  reconciles: boolean;
};

/**
 * Opening, in, out and closing per place (godown or truck) for the range [start, end).
 * Rows at or after `end` are ignored. Places with all four numbers 0 are left out.
 * Godowns come first, then trucks, each by name.
 */
export function placeFlows(
  rows: readonly StockMoveRow[],
  range: { start: Date; end: Date },
  names: { godowns: Names; vehicles: Names },
): PlaceFlow[] {
  const start = range.start.getTime();
  const end = range.end.getTime();
  const places = new Map<string, PlaceFlow>();
  for (const r of rows) {
    const t = new Date(r.createdAt).getTime();
    if (t >= end) continue;
    const kind = r.godownId ? "godown" : "vehicle";
    const id = r.godownId ?? r.vehicleId ?? "";
    const key = placeKey({ kind, id });
    let p = places.get(key);
    if (!p) {
      const label = (kind === "godown" ? names.godowns : names.vehicles).get(id) ?? (kind === "godown" ? "Godown" : "Truck");
      p = { key, kind, label, openingBags: 0, inBags: 0, outBags: 0, closingBags: 0, reconciles: true };
      places.set(key, p);
    }
    p.closingBags += r.bags;
    if (t < start) {
      p.openingBags += r.bags;
      continue;
    }
    if (r.type === "purchase" || r.type === "opening") p.inBags += r.bags;
    else if (r.type === "dispatch") p.outBags -= r.bags;
    else if (r.type === "transfer" || r.type === "adjustment") {
      if (r.bags > 0) p.inBags += r.bags;
      else p.outBags -= r.bags;
    }
    // Any other type is counted in closing only, so the place will not reconcile (and is flagged).
  }
  const out = [...places.values()].filter((p) => p.openingBags !== 0 || p.inBags !== 0 || p.outBags !== 0 || p.closingBags !== 0);
  for (const p of out) p.reconciles = p.openingBags + p.inBags - p.outBags === p.closingBags;
  return out.sort((a, b) => (a.kind === b.kind ? a.label.localeCompare(b.label) : a.kind === "godown" ? -1 : 1));
}

/** Adds the places together (for the totals row). Transfers count in on one place and out on another. */
export function totalPlaceFlow(list: readonly PlaceFlow[]): Omit<PlaceFlow, "key" | "kind" | "label"> {
  const t = { openingBags: 0, inBags: 0, outBags: 0, closingBags: 0, reconciles: true };
  for (const p of list) {
    t.openingBags += p.openingBags;
    t.inBags += p.inBags;
    t.outBags += p.outBags;
    t.closingBags += p.closingBags;
    t.reconciles &&= p.reconciles;
  }
  return t;
}
