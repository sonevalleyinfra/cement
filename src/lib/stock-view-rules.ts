/**
 * How the stock screen groups and filters bags. Plain functions: no database, no request.
 * Rows are bags per product per place (one firm, or all firms added together).
 */
import { bagsToKg, CHANNEL_LABELS, PRODUCT_CHANNELS, type ProductChannel } from "./catalogue-rules";

export type StockProduct = {
  id: string;
  name: string;
  channel: string;
  typeCode: string;
  grade: string;
  bagKg: number;
};

export type StockRow = {
  productId: string;
  placeKey: string;
  placeName: string;
  placeKind: string;
  bags: number;
};

/** "all" or one value from the drop-down. */
export type StockFilters = { channel: "all" | ProductChannel; typeCode: string };
export const NO_FILTERS: StockFilters = { channel: "all", typeCode: "all" };

export type Amount = { bags: number; kg: number };

function matches(p: StockProduct, f: StockFilters): boolean {
  return (f.channel === "all" || p.channel === f.channel) && (f.typeCode === "all" || p.typeCode === f.typeCode);
}

/** Rows whose product passes the filters, with each product's details. Unknown products are skipped. */
function visibleRows(rows: readonly StockRow[], products: readonly StockProduct[], f: StockFilters) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const out: (StockRow & { product: StockProduct })[] = [];
  for (const r of rows) {
    const product = byId.get(r.productId);
    if (product && r.bags !== 0 && matches(product, f)) out.push({ ...r, product });
  }
  return out;
}

/** Total bags and weight after filters. */
export function stockTotal(rows: readonly StockRow[], products: readonly StockProduct[], f: StockFilters): Amount {
  let bags = 0;
  let kg = 0;
  for (const r of visibleRows(rows, products, f)) {
    bags += r.bags;
    kg += bagsToKg(r.bags, r.product.bagKg);
  }
  return { bags, kg };
}

export type ProductSection = {
  label: string;
  items: (Amount & { product: StockProduct; places: { key: string; name: string; kind: string; bags: number }[] })[];
};

/**
 * By product: Trade / Non-trade sections, products in catalogue order (the order of `products`),
 * each with its total and the places holding it. Products with no bags are left out.
 */
export function stockByProduct(
  rows: readonly StockRow[],
  products: readonly StockProduct[],
  f: StockFilters,
): ProductSection[] {
  const visible = visibleRows(rows, products, f);
  return PRODUCT_CHANNELS.map((channel) => ({
    label: CHANNEL_LABELS[channel],
    items: products
      .filter((p) => p.channel === channel)
      .map((product) => {
        const mine = visible.filter((r) => r.productId === product.id);
        const bags = mine.reduce((s, r) => s + r.bags, 0);
        const places = mine
          .map((r) => ({ key: r.placeKey, name: r.placeName, kind: r.placeKind, bags: r.bags }))
          .sort(placeOrder);
        return { product, bags, kg: bagsToKg(bags, product.bagKg), places };
      })
      .filter((i) => i.bags !== 0),
  })).filter((s) => s.items.length > 0);
}

export type PlaceCard = Amount & {
  key: string;
  name: string;
  kind: string;
  lines: { product: StockProduct; bags: number }[];
};

/** By place: godowns first, then vehicles, by name; each with its products (catalogue order). Empty places left out. */
export function stockByPlace(rows: readonly StockRow[], products: readonly StockProduct[], f: StockFilters): PlaceCard[] {
  const order = new Map(products.map((p, i) => [p.id, i]));
  const cards = new Map<string, PlaceCard>();
  for (const r of visibleRows(rows, products, f)) {
    const card = cards.get(r.placeKey) ?? { key: r.placeKey, name: r.placeName, kind: r.placeKind, bags: 0, kg: 0, lines: [] };
    card.bags += r.bags;
    card.kg += bagsToKg(r.bags, r.product.bagKg);
    const line = card.lines.find((l) => l.product.id === r.productId);
    if (line) line.bags += r.bags;
    else card.lines.push({ product: r.product, bags: r.bags });
    cards.set(r.placeKey, card);
  }
  return [...cards.values()]
    .map((c) => ({
      ...c,
      lines: c.lines.filter((l) => l.bags !== 0).sort((a, b) => (order.get(a.product.id) ?? 0) - (order.get(b.product.id) ?? 0)),
    }))
    .filter((c) => c.lines.length > 0)
    .sort(placeOrder);
}

/** Godowns before vehicles, then by name. */
function placeOrder(a: { kind: string; name: string }, b: { kind: string; name: string }): number {
  if (a.kind !== b.kind) return a.kind === "godown" ? -1 : 1;
  return a.name.localeCompare(b.name);
}

/** Type codes for the Type filter, in the order they first appear in the catalogue. */
export function typeCodes(products: readonly StockProduct[]): string[] {
  return [...new Set(products.map((p) => p.typeCode))];
}
