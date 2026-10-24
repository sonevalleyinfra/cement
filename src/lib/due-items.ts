/**
 * What a retailer still owes, item by item, read from their ledger only (for aging).
 * Plain functions (no database) so they are easy to test.
 * Source: docs/idea.md section 5 ("Payments clear oldest dues first (for aging)").
 *
 * The ledger (`ledger_entries`, signed paise, + = the retailer owes) is the source of truth.
 * - Debit items, oldest first: a positive opening balance (always first), then each dispatch
 *   (an `order_debit` row: bags x rate, billed when the bags leave) and each positive adjustment
 *   (admin: the retailer owes more), each as its own item dated when it was posted. So a second load
 *   sent a month later, or an adjustment added today, ages from its own day.
 * - Credits = minus the sum of every other row: payments (minus), payment reversals (plus: they
 *   cancel a payment, so they bring the old items back rather than starting a new one), a negative
 *   opening and negative adjustments. Credits are applied to the items oldest first; what is left of
 *   each item is still due. So an advance pays later dispatches by itself.
 * - A dispatch reversal (`dispatch_reversal`, minus: bags returned or a wrong load undone, v2 B2) is NOT a
 *   general credit: it cancels the debit of the load it reverses (the `order` item with the same order
 *   and the same moment, `reversesAt` = the original dispatch's time), so the shop's oldest overdue item
 *   is not cleared by it. Whatever it cannot cancel there (no such item, or more than is left of it) falls
 *   back to the general credits, so the promise below still holds.
 *
 * Choices where the spec is silent:
 * - Ties (same moment) keep the order the entries were given in.
 * - If the credits add up to a debit (more reversed than paid, which should not happen), that amount
 *   becomes one more item ("other"), dated at its first such row, so the promise below always holds.
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
  /** `dispatch_reversal` rows: when the reversed load was dispatched (= its order_debit row's moment). */
  reversesAt?: Date | string | null;
};

export type DueItem = {
  kind: "opening" | "order" | "adjustment" | "other";
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
  let balance = 0;
  let credits = 0;
  let firstLooseDebit: { at: number; seq: number } | null = null;
  const reversals: { orderId: string | null; at: number; amount: number }[] = [];

  rows.forEach((e, seq) => {
    balance += e.amountPaise;
    const at = new Date(e.createdAt).getTime();
    if (e.amountPaise < 0 && e.kind === "dispatch_reversal" && e.reversesAt != null) {
      reversals.push({ orderId: e.orderId, at: new Date(e.reversesAt).getTime(), amount: -e.amountPaise });
    } else if (e.amountPaise > 0 && e.kind === "opening") drafts.push({ kind: "opening", orderId: null, at, seq, amount: e.amountPaise });
    else if (e.amountPaise > 0 && e.kind === "order_debit") {
      drafts.push({ kind: "order", orderId: e.orderId, at, seq, amount: e.amountPaise });
    } else if (e.amountPaise > 0 && e.kind === "adjustment") {
      drafts.push({ kind: "adjustment", orderId: null, at, seq, amount: e.amountPaise });
    } else {
      credits -= e.amountPaise;
      if (e.amountPaise > 0 && (firstLooseDebit === null || at < firstLooseDebit.at)) firstLooseDebit = { at, seq };
    }
  });

  // Each reversal takes its load's debit down first; the rest is a general credit.
  for (const r of reversals) {
    let rest = r.amount;
    for (const d of drafts) {
      if (rest === 0) break;
      if (d.kind !== "order" || d.orderId !== r.orderId || d.at !== r.at) continue;
      const used = Math.min(rest, d.amount);
      d.amount -= used;
      rest -= used;
    }
    credits += rest;
  }

  if (credits < 0) {
    const from: { at: number; seq: number } = firstLooseDebit ?? { at: 0, seq: 0 };
    drafts.push({ kind: "other", orderId: null, at: from.at, seq: from.seq, amount: -credits });
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
