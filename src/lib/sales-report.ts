/**
 * Sales and profit reports as plain functions (no database).
 * Source: docs/idea.md section 9 ("Sales: bags and ₹ by product, retailer, sales person, day";
 * "Profit: sales value − cost (average purchase cost per bag, per product), per bag and total").
 *
 * Choices where the spec is silent:
 * - A sale is a DISPATCH (that is when bags are billed): value = bags × the rate stored on that
 *   dispatch. Orders that were never dispatched are not sales.
 * - The sales person is the shop's sales person recorded on the order ("No sales person" if empty).
 * - The day is the calendar day in India when the bags left.
 * - Cost per bag = weighted average purchase cost of that product: (Σ bags × cost) ÷ Σ bags, over
 *   purchases with a known cost up to the end of the range (older purchases without a cost are
 *   left out). Cost of the bags sold = bags × that average, rounded to the paisa (no floats).
 * - A product with no known cost shows "cost unknown" and is left out of the profit total.
 * - Scheme / discount credits from suppliers (all brands) are shown on their own, never mixed into product profit.
 */
import { toISTDateKey } from "./datetime";
import { mulDivRound } from "./money";

export type SaleRow = {
  bags: number;
  ratePaise: number;
  createdAt: Date | string;
  productId: string;
  productName: string;
  retailerId: string;
  retailerName: string;
  salesRepId: string | null;
  salesRepName: string | null;
};

export type SalesLine = { key: string; label: string; bags: number; valuePaise: number; loads: number };

export type SalesReport = {
  loads: number;
  bags: number;
  valuePaise: number;
  byProduct: SalesLine[];
  byRetailer: SalesLine[];
  bySalesPerson: SalesLine[];
  /** Oldest day first; key = "YYYY-MM-DD" (India). */
  byDay: SalesLine[];
};

/** Value of one dispatch: bags × rate, whole paise. */
export function saleValuePaise(bags: number, ratePaise: number): number {
  if (!Number.isSafeInteger(bags) || !Number.isSafeInteger(ratePaise)) throw new RangeError("Bags and rate must be whole numbers");
  const v = bags * ratePaise;
  if (!Number.isSafeInteger(v)) throw new RangeError("Sale value is too large");
  return v;
}

function addTo(map: Map<string, SalesLine>, key: string, label: string, bags: number, value: number) {
  const line = map.get(key) ?? { key, label, bags: 0, valuePaise: 0, loads: 0 };
  line.bags += bags;
  line.valuePaise += value;
  line.loads += 1;
  map.set(key, line);
}

const biggestFirst = (a: SalesLine, b: SalesLine) => b.valuePaise - a.valuePaise || b.bags - a.bags || a.label.localeCompare(b.label);

/** Groups the dispatches of a range. The groups each add up to the totals. */
export function salesReport(rows: readonly SaleRow[]): SalesReport {
  const product = new Map<string, SalesLine>();
  const retailer = new Map<string, SalesLine>();
  const person = new Map<string, SalesLine>();
  const day = new Map<string, SalesLine>();
  let bags = 0;
  let value = 0;
  for (const r of rows) {
    const v = saleValuePaise(r.bags, r.ratePaise);
    bags += r.bags;
    value += v;
    addTo(product, r.productId, r.productName, r.bags, v);
    addTo(retailer, r.retailerId, r.retailerName, r.bags, v);
    addTo(person, r.salesRepId ?? "none", r.salesRepId ? (r.salesRepName ?? "Unknown") : "No sales person", r.bags, v);
    const key = toISTDateKey(r.createdAt);
    addTo(day, key, key, r.bags, v);
  }
  return {
    loads: rows.length,
    bags,
    valuePaise: value,
    byProduct: [...product.values()].sort(biggestFirst),
    byRetailer: [...retailer.values()].sort(biggestFirst),
    bySalesPerson: [...person.values()].sort(biggestFirst),
    byDay: [...day.values()].sort((a, b) => a.key.localeCompare(b.key)),
  };
}

/* ---------- Profit ---------- */

export type PurchaseCostRow = { productId: string; bags: number; unitCostPaise: number | null };

export type CostTotals = { bags: number; costPaise: number };

/** Σ bags and Σ bags × cost per product, from purchases with a known cost (others are skipped). */
export function purchaseCostTotals(rows: readonly PurchaseCostRow[]): Map<string, CostTotals> {
  const out = new Map<string, CostTotals>();
  for (const r of rows) {
    if (r.unitCostPaise === null || r.unitCostPaise <= 0 || r.bags <= 0) continue;
    const t = out.get(r.productId) ?? { bags: 0, costPaise: 0 };
    t.bags += r.bags;
    t.costPaise += saleValuePaise(r.bags, r.unitCostPaise);
    out.set(r.productId, t);
  }
  return out;
}

/** Weighted average cost of one bag, rounded to the paisa. Null when nothing is known. */
export function averageCostPerBag(t: CostTotals | undefined): number | null {
  if (!t || t.bags <= 0) return null;
  return mulDivRound(1, t.costPaise, t.bags);
}

export type ProfitLine = {
  productId: string;
  label: string;
  bags: number;
  salesPaise: number;
  /** Null = cost unknown (no purchase with a cost yet). */
  avgCostPaise: number | null;
  costPaise: number | null;
  profitPaise: number | null;
  profitPerBagPaise: number | null;
};

export type ProfitReport = {
  lines: ProfitLine[];
  /** Totals over the products with a known cost only. */
  total: { bags: number; salesPaise: number; costPaise: number; profitPaise: number; profitPerBagPaise: number | null };
  /** Sales of products whose cost is unknown (left out of the total). */
  unknown: { products: number; bags: number; salesPaise: number };
};

/** Profit per product for the dispatches of a range, using the average purchase cost. */
export function profitReport(sales: readonly SaleRow[], purchases: readonly PurchaseCostRow[]): ProfitReport {
  const costs = purchaseCostTotals(purchases);
  const byProduct = salesReport(sales).byProduct;
  const total = { bags: 0, salesPaise: 0, costPaise: 0, profitPaise: 0, profitPerBagPaise: null as number | null };
  const unknown = { products: 0, bags: 0, salesPaise: 0 };
  const lines = byProduct.map((p): ProfitLine => {
    const t = costs.get(p.key);
    const avg = averageCostPerBag(t);
    if (!t || avg === null) {
      unknown.products += 1;
      unknown.bags += p.bags;
      unknown.salesPaise += p.valuePaise;
      return { productId: p.key, label: p.label, bags: p.bags, salesPaise: p.valuePaise, avgCostPaise: null, costPaise: null, profitPaise: null, profitPerBagPaise: null };
    }
    const cost = mulDivRound(p.bags, t.costPaise, t.bags);
    const profit = p.valuePaise - cost;
    total.bags += p.bags;
    total.salesPaise += p.valuePaise;
    total.costPaise += cost;
    total.profitPaise += profit;
    return {
      productId: p.key,
      label: p.label,
      bags: p.bags,
      salesPaise: p.valuePaise,
      avgCostPaise: avg,
      costPaise: cost,
      profitPaise: profit,
      profitPerBagPaise: p.bags > 0 ? mulDivRound(profit, 1, p.bags) : null,
    };
  });
  total.profitPerBagPaise = total.bags > 0 ? mulDivRound(total.profitPaise, 1, total.bags) : null;
  return { lines, total, unknown };
}

/** Scheme / discount credits from suppliers in the range, as a plus amount (entries store them as minus). */
export function schemeCreditsPaise(entries: readonly { kind: string; amountPaise: number }[]): number {
  return entries.filter((e) => e.kind === "credit").reduce((n, e) => n - e.amountPaise, 0);
}
