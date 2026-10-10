/**
 * What a retailer still owes, item by item, read from their ledger only (for aging).
 * Plain functions (no database) so they are easy to test.
 * Source: docs/idea.md section 5 ("Payments clear oldest dues first (for aging)").
 *
 * The ledger (`ledger_entries`, signed paise, + = the retailer owes) is the source of truth.
 * - Debit items, oldest first: a positive opening balance (always first), then
 *   each order's NET of every entry with that orderId (approval debit + rate changes +
 *   cancel reversal). An order whose net is 0 or less is not an item.
 * - Credits = minus the sum of every entry WITHOUT an orderId (payment credits, payment
 *   reversals, adjustments, a negative opening), plus minus each negative order net.
 *   Credits are applied to the items oldest first; what is left of each item is still due.
 * - So an advance pays later orders by itself, money paid on a later-cancelled order
 *   stays with the retailer, and an opening balance shows as the oldest due.
 *
 * Choices where the spec is silent:
 * - An order's date is its earliest ledger entry (the approval), not when it was placed.
 * - Ties (same moment) keep the order the entries were given in.
 * - If the entries without an orderId add up to a debit (for example a manual adjustment),
 *   that amount becomes one more item ("other"), dated at its first such entry, so the
 *   promise below always holds.
 *
 * Promise (tested): duePaise === max(0, ledger balance).
 */

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
  const orders = new Map<string, Draft>();
  let balance = 0;
  let looseSum = 0; // entries without an order, except a positive opening
  let firstLooseDebitAt: number | null = null;
  let firstLooseDebitSeq = 0;

  rows.forEach((e, seq) => {
    balance += e.amountPaise;
    const at = new Date(e.createdAt).getTime();
    if (e.orderId) {
      const d = orders.get(e.orderId);
      if (d) {
        d.amount += e.amountPaise;
        if (at < d.at) d.at = at;
      } else {
        orders.set(e.orderId, { kind: "order", orderId: e.orderId, at, seq, amount: e.amountPaise });
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
  for (const d of orders.values()) {
    if (d.amount > 0) drafts.push(d);
    else credits -= d.amount;
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
