/**
 * What a retailer still owes, item by item, read from their ledger only (for aging).
 * Plain functions (no database) so they are easy to test.
 * Source: docs/idea.md section 5 ("Payments clear oldest dues first (for aging)").
 *
 * The ledger (`ledger_entries`, signed paise, + = the retailer owes) is the source of truth.
 * - Debit items, oldest first: a positive opening balance (always first), then each dispatch
 *   (an `order_debit` row: bags x rate, billed when the bags leave) as its own item, dated when
 *   it was posted. So a second load sent a month later ages from its own day.
 * - Any other row linked to an order (older data: rate fixes, cancel reversals) belongs to that
 *   order: a plus adds to the order's oldest item, a minus clears the order's items oldest first.
 *   If an order ends up at 0 or less, the rest is a credit.
 * - Credits = minus the sum of every entry WITHOUT an orderId (payment credits, payment
 *   reversals, adjustments, a negative opening), plus what is left of negative orders.
 *   Credits are applied to the items oldest first; what is left of each item is still due.
 * - So an advance pays later dispatches by itself, and an opening balance shows as the oldest due.
 *
 * Choices where the spec is silent:
 * - Ties (same moment) keep the order the entries were given in.
 * - If the entries without an orderId add up to a debit (for example a manual adjustment),
 *   that amount becomes one more item ("other"), dated at its first such entry, so the
 *   promise below always holds.
 * - Aging counts whole calendar days in India from the day an item was posted to the "as of" day:
 *   0-30 days, 31-60, 61-90, over 90.
 *
 * Promise (tested): duePaise === max(0, ledger balance), and the aging buckets add up to duePaise.
 */
import { toISTDateKey } from "./datetime";
import { daysBetween } from "./report-range";

export type LedgerRow = {
  kind: string;
  /** Signed paise: + debit, - credit. */
  amountPaise: number;
  orderId: string | null;
  createdAt: Date | string;
};

export type DueItem = {
  kind: "opening" | "order" | "other";
  /** The order, for kind "order". */
  orderId: string | null;
  /** When the debit was first posted. */
  dueSince: Date;
  /** Still owed on this item, paise above 0. */
  duePaise: number;
};

export type RetailerDues = {
  /** Sum of every ledger entry (negative = advance). */
  balancePaise: number;
  /** Still owed = max(0, balancePaise). */
  duePaise: number;
  /** Items still owed, oldest first. */
  items: DueItem[];
};

type Draft = { kind: DueItem["kind"]; orderId: string | null; at: number; seq: number; amount: number };

function itemOrder(a: Draft, b: Draft): number {
  const rank = (d: Draft) => (d.kind === "opening" ? 0 : 1);
  return rank(a) - rank(b) || a.at - b.at || a.seq - b.seq;
}

/** Dues from one retailer's ledger entries (given oldest first). */
export function duesFromLedger(rows: readonly LedgerRow[]): RetailerDues {
  for (const e of rows) {
    if (!Number.isSafeInteger(e.amountPaise)) throw new RangeError("Ledger amounts must be whole paise");
  }
  const drafts: Draft[] = [];
  // Per order: its dispatch items (oldest first) and the sum of its other rows.
  const orders = new Map<string, { items: Draft[]; extra: number; firstAt: number; firstSeq: number }>();
  let balance = 0;
  let looseSum = 0; // entries without an order, except a positive opening
  let firstLooseDebitAt: number | null = null;
  let firstLooseDebitSeq = 0;

  rows.forEach((e, seq) => {
    balance += e.amountPaise;
    const at = new Date(e.createdAt).getTime();
    if (e.orderId) {
      let o = orders.get(e.orderId);
      if (!o) {
        o = { items: [], extra: 0, firstAt: at, firstSeq: seq };
        orders.set(e.orderId, o);
      }
      if (at < o.firstAt) [o.firstAt, o.firstSeq] = [at, seq];
      if (e.kind === "order_debit" && e.amountPaise > 0) {
        o.items.push({ kind: "order", orderId: e.orderId, at, seq, amount: e.amountPaise });
      } else {
        o.extra += e.amountPaise;
      }
    } else if (e.kind === "opening" && e.amountPaise > 0) {
      drafts.push({ kind: "opening", orderId: null, at, seq, amount: e.amountPaise });
    } else {
      looseSum += e.amountPaise;
      if (e.amountPaise > 0 && (firstLooseDebitAt === null || at < firstLooseDebitAt)) {
        firstLooseDebitAt = at;
        firstLooseDebitSeq = seq;
      }
    }
  });

  let credits = -looseSum;
  for (const [orderId, o] of orders) {
    o.items.sort((a, b) => a.at - b.at || a.seq - b.seq);
    if (o.extra > 0) {
      if (o.items.length > 0) o.items[0].amount += o.extra;
      else o.items.push({ kind: "order", orderId, at: o.firstAt, seq: o.firstSeq, amount: o.extra });
    } else if (o.extra < 0) {
      let take = -o.extra;
      for (const item of o.items) {
        const used = Math.min(take, item.amount);
        item.amount -= used;
        take -= used;
      }
      credits += take; // more taken off than this order was billed: the rest is a credit
    }
    for (const item of o.items) if (item.amount > 0) drafts.push(item);
  }
  if (credits < 0) {
    drafts.push({ kind: "other", orderId: null, at: firstLooseDebitAt ?? 0, seq: firstLooseDebitSeq, amount: -credits });
    credits = 0;
  }

  drafts.sort(itemOrder);
  const items: DueItem[] = [];
  for (const d of drafts) {
    const used = Math.min(credits, d.amount);
    credits -= used;
    const left = d.amount - used;
    if (left > 0) items.push({ kind: d.kind, orderId: d.orderId, dueSince: new Date(d.at), duePaise: left });
  }
  const due = items.reduce((n, i) => n + i.duePaise, 0);
  return { balancePaise: balance, duePaise: due, items };
}

/** The oldest item still owed, or null when nothing is due. */
export function oldestDue(f: RetailerDues): Date | null {
  return f.items[0]?.dueSince ?? null;
}

/** Aging buckets in paise. */
export type AgingBuckets = {
  /** 0 to 30 days old. */
  d0_30: number;
  d31_60: number;
  d61_90: number;
  /** More than 90 days old. */
  d90plus: number;
};

export const AGING_LABELS: Record<keyof AgingBuckets, string> = {
  d0_30: "0–30",
  d31_60: "31–60",
  d61_90: "61–90",
  d90plus: "90+",
};

export function emptyBuckets(): AgingBuckets {
  return { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
}

/** The bucket for an item that is `days` old (an item dated after the "as of" day counts as 0). */
export function bucketFor(days: number): keyof AgingBuckets {
  if (days <= 30) return "d0_30";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "d90plus";
}

/**
 * Splits what is still due into aging buckets, as of the day `asOfKey` ("YYYY-MM-DD", India).
 * Each item's age is whole calendar days in India from the day it was posted.
 */
export function agingBuckets(dues: RetailerDues, asOfKey: string): AgingBuckets {
  const out = emptyBuckets();
  for (const item of dues.items) {
    out[bucketFor(daysBetween(toISTDateKey(item.dueSince), asOfKey))] += item.duePaise;
  }
  return out;
}

/** Adds bucket totals together. */
export function addBuckets(a: AgingBuckets, b: AgingBuckets): AgingBuckets {
  return { d0_30: a.d0_30 + b.d0_30, d31_60: a.d31_60 + b.d31_60, d61_90: a.d61_90 + b.d61_90, d90plus: a.d90plus + b.d90plus };
}

export function bucketsTotal(b: AgingBuckets): number {
  return b.d0_30 + b.d31_60 + b.d61_90 + b.d90plus;
}

export type DuesLine = { retailerId: string; name: string; duePaise: number; buckets: AgingBuckets };
export type AdvanceLine = { retailerId: string; name: string; advancePaise: number };

export type DuesAging = {
  /** Retailers who owe, biggest dues first. */
  lines: DuesLine[];
  total: { duePaise: number; buckets: AgingBuckets };
  /** Retailers with a minus balance (they paid ahead), biggest first. Not netted against dues. */
  advances: AdvanceLine[];
  advancesPaise: number;
};

/**
 * Dues with aging for every retailer, as of `asOfKey`. Pass every ledger row up to the end of
 * that day, oldest first. Promise (tested): each line's buckets add up to its dues, the total
 * equals the sum of positive balances, and advances are listed apart.
 */
export function duesAging(
  rows: readonly (LedgerRow & { retailerId: string })[],
  names: ReadonlyMap<string, string>,
  asOfKey: string,
): DuesAging {
  const by = new Map<string, LedgerRow[]>();
  for (const r of rows) {
    const list = by.get(r.retailerId) ?? [];
    list.push(r);
    by.set(r.retailerId, list);
  }
  const lines: DuesLine[] = [];
  const advances: AdvanceLine[] = [];
  let total = emptyBuckets();
  for (const [retailerId, list] of by) {
    const name = names.get(retailerId) ?? "Retailer";
    const dues = duesFromLedger(list);
    if (dues.duePaise > 0) {
      const buckets = agingBuckets(dues, asOfKey);
      total = addBuckets(total, buckets);
      lines.push({ retailerId, name, duePaise: dues.duePaise, buckets });
    } else if (dues.balancePaise < 0) {
      advances.push({ retailerId, name, advancePaise: -dues.balancePaise });
    }
  }
  lines.sort((a, b) => b.duePaise - a.duePaise || a.name.localeCompare(b.name));
  advances.sort((a, b) => b.advancePaise - a.advancePaise || a.name.localeCompare(b.name));
  return {
    lines,
    total: { duePaise: bucketsTotal(total), buckets: total },
    advances,
    advancesPaise: advances.reduce((n, a) => n + a.advancePaise, 0),
  };
}
