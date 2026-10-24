/**
 * Hints under the rate and product fields (new order, fill rate, change rate, approval card):
 * the shop's last rate, this week's range for the product, a warning when the typed rate is far
 * from the last one, and the bags in stock. Plain functions (no database) so they are tested.
 * Staff only: a retailer never gets any of this (the server never sends it).
 *
 * Choices where the spec is silent:
 * - "Far" = more than ₹10 per bag either way; exactly ₹10 is not warned.
 * - Hints warn and never block saving.
 */
import { formatDayMonth } from "./datetime";
import { formatINR } from "./money";
import { bagsText } from "./words";

/** More than this many paise from the last rate (₹10 per bag) gets a warning. */
export const RATE_DEVIATION_PAISE = 1000;

export type RateCandidate = { ratePaise: number; at: Date };

/** The latest rate of the candidates, or null when there are none. */
export function pickLastRate(candidates: readonly RateCandidate[]): RateCandidate | null {
  let last: RateCandidate | null = null;
  for (const c of candidates) {
    if (!last || c.at.getTime() > last.at.getTime()) last = c;
  }
  return last ? { ratePaise: last.ratePaise, at: last.at } : null;
}

/** Lowest and highest rate, or null when there are none. */
export function weekRange(ratePaises: readonly number[]): { minPaise: number; maxPaise: number } | null {
  if (ratePaises.length === 0) return null;
  return { minPaise: Math.min(...ratePaises), maxPaise: Math.max(...ratePaises) };
}

export type RateDeviation = { dir: "below" | "above"; diffPaise: number };

/** How far the typed rate is from the last rate, only when it is more than ₹10 away. */
export function rateDeviation(ratePaise: number, lastPaise: number | null): RateDeviation | null {
  if (lastPaise === null) return null;
  const diff = ratePaise - lastPaise;
  if (Math.abs(diff) <= RATE_DEVIATION_PAISE) return null;
  return { dir: diff < 0 ? "below" : "above", diffPaise: Math.abs(diff) };
}

const rupees = (paise: number) => formatINR(paise, { hidePaise: true });

/** "₹18 below last rate" / "₹12.50 above last rate". */
export function deviationText(dev: RateDeviation): string {
  return `${rupees(dev.diffPaise)} ${dev.dir} last rate`;
}

/** What the server sends for the rate hints (dates as ISO text, so it is plain JSON). */
export type RateHint = {
  last: { ratePaise: number; atIso: string } | null;
  week: { minPaise: number; maxPaise: number } | null;
};

/** "Last ₹353 · 12 Oct · Week ₹348–360"; either half alone; "" when there is nothing. */
export function lastRateText(hint: RateHint | null | undefined): string {
  const parts: string[] = [];
  if (hint?.last) parts.push(`Last ${rupees(hint.last.ratePaise)} · ${formatDayMonth(hint.last.atIso)}`);
  if (hint?.week) {
    const { minPaise, maxPaise } = hint.week;
    parts.push(
      minPaise === maxPaise ? `Week ${rupees(minPaise)}` : `Week ${rupees(minPaise)}–${rupees(maxPaise).replace("₹", "")}`,
    );
  }
  return parts.join(" · ");
}

export type StockHint = { tone: "muted" | "caution"; text: string };

/** Bags in stock for the product: muted when enough, caution when short or out. Never blocks. */
export function stockHint(stockBags: number, bags: number): StockHint {
  if (stockBags <= 0) return { tone: "caution", text: "Out of stock" };
  if (bags > stockBags) return { tone: "caution", text: `Only ${bagsText(stockBags)} in stock` };
  return { tone: "muted", text: `${bagsText(stockBags)} in stock` };
}
