/**
 * Retailer ledger rules as plain functions (no database) so they are easy to test.
 * Source: docs/idea.md section 7 (Ledgers) and section 4 (Order Flow).
 *
 * Choices where the spec is silent:
 * - Amounts are SIGNED integer paise: positive = debit (retailer owes), negative = credit.
 * - The order debit (bags x rate) is posted when Accounts APPROVES the order, because
 *   that is when the rate is final and the order becomes a real sale.
 * - A rate edit at dispatch is for that truck only (owner's decision): it adds an adjustment
 *   of that truck's bags x (truck rate - order rate). Other trucks keep the order rate.
 * - Cancelling adds one compensating entry. Nothing sent: it cancels everything posted for
 *   the order. Partly sent ("close short"): it takes off only the bags not sent, at the
 *   order rate (the amount comes from planCancel in order-rules.ts).
 * - Entries are never edited; only new rows are added.
 * - One opening balance per retailer + firm. It may be negative (retailer has advance).
 * - Retailers can see their own ledger (spec: "view dues per firm").
 */
export const LEDGER_KINDS = ["opening", "order_debit", "receipt_credit", "adjustment"] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export type LedgerEntry = {
  firmId: string;
  retailerId: string;
  kind: LedgerKind;
  /** Signed paise: + debit, - credit. */
  amountPaise: number;
  orderId?: string | null;
};

export type EntryResult = { ok: true; entry: LedgerEntry } | { ok: false; error: string };

/** Entries with the balance after each one, in the order given (oldest first). */
export function withRunningBalance<T extends { amountPaise: number }>(
  entries: readonly T[],
): (T & { balancePaise: number })[] {
  let sum = 0;
  return entries.map((e) => {
    sum += e.amountPaise;
    return { ...e, balancePaise: sum };
  });
}

export function sumPaise(entries: readonly { amountPaise: number }[]): number {
  return entries.reduce((n, e) => n + e.amountPaise, 0);
}

/** Balance of one retailer with one firm. */
export function balanceForFirm(
  entries: readonly { firmId: string; retailerId: string; amountPaise: number }[],
  retailerId: string,
  firmId: string,
): number {
  return sumPaise(entries.filter((e) => e.retailerId === retailerId && e.firmId === firmId));
}

/** Balance of one retailer across all firms. */
export function balanceAcrossFirms(
  entries: readonly { retailerId: string; amountPaise: number }[],
  retailerId: string,
): number {
  return sumPaise(entries.filter((e) => e.retailerId === retailerId));
}

/** Balance per firm id for one retailer. */
export function balancesByFirm(
  entries: readonly { firmId: string; retailerId: string; amountPaise: number }[],
  retailerId: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) {
    if (e.retailerId !== retailerId) continue;
    out[e.firmId] = (out[e.firmId] ?? 0) + e.amountPaise;
  }
  return out;
}

/** What the retailer owes: only positive balances count as dues (an advance is not negative dues). */
export function duesFrom(balancePaise: number): number {
  return Math.max(0, balancePaise);
}

export type DuesSummary = {
  withFirmPaise: number;
  allFirmsPaise: number;
  /** Net balance across firms (can be negative if the retailer paid in advance). */
  netAllFirmsPaise: number;
};

/**
 * Dues summary for one retailer: with the given firm, and the total across firms.
 * Total dues sum each firm's positive balance (an advance with one firm does not
 * cancel what is owed to another firm, because each firm has its own books).
 */
export function summariseDues(
  entries: readonly { firmId: string; retailerId: string; amountPaise: number }[],
  retailerId: string,
  firmId: string,
): DuesSummary {
  const perFirm = balancesByFirm(entries, retailerId);
  const all = Object.values(perFirm);
  return {
    withFirmPaise: duesFrom(perFirm[firmId] ?? 0),
    allFirmsPaise: all.reduce((n, b) => n + duesFrom(b), 0),
    netAllFirmsPaise: all.reduce((n, b) => n + b, 0),
  };
}

/** Order debit = bags x rate per bag, in paise. Needs whole bags >= 1 and a rate >= 1 paise. */
export function orderDebitPaise(bags: number, ratePaise: number | null | undefined): number | null {
  if (!Number.isInteger(bags) || bags < 1) return null;
  if (ratePaise == null || !Number.isInteger(ratePaise) || ratePaise < 1) return null;
  const total = bags * ratePaise;
  // Money columns are bigint, so the only limit is what JavaScript can count exactly.
  return Number.isSafeInteger(total) ? total : null;
}

/** Largest opening balance we accept: ₹100 crore (a typo guard, not a real business limit). */
export const MAX_OPENING_PAISE = 100 * 1_00_00_000 * 100;

/** The debit entry to post when an order is approved. */
export function orderDebitEntry(order: {
  id: string;
  firmId: string;
  retailerId: string;
  bags: number;
  ratePaise: number | null;
}): EntryResult {
  const amount = orderDebitPaise(order.bags, order.ratePaise);
  if (amount === null) return { ok: false, error: "The order needs bags and a rate before it can be billed." };
  return {
    ok: true,
    entry: {
      firmId: order.firmId,
      retailerId: order.retailerId,
      kind: "order_debit",
      amountPaise: amount,
      orderId: order.id,
    },
  };
}

/**
 * Extra entry when logistics changes the rate for one truck: that truck's bags x
 * (truck rate - order rate). Null when nothing changes or a value is missing.
 */
export function truckRateChangeEntry(
  order: { id: string; firmId: string; retailerId: string },
  truckBags: number,
  orderRatePaise: number | null,
  truckRatePaise: number | null,
): LedgerEntry | null {
  const oldTotal = orderDebitPaise(truckBags, orderRatePaise);
  const newTotal = orderDebitPaise(truckBags, truckRatePaise);
  if (oldTotal === null || newTotal === null || oldTotal === newTotal) return null;
  return {
    firmId: order.firmId,
    retailerId: order.retailerId,
    kind: "adjustment",
    amountPaise: newTotal - oldTotal,
    orderId: order.id,
  };
}

/**
 * Compensating entry when an order is cancelled or closed short, for the signed amount
 * planCancel worked out. Null when there is nothing to post (zero or not whole paise).
 */
export function cancelEntry(
  order: { id: string; firmId: string; retailerId: string },
  amountPaise: number,
): LedgerEntry | null {
  if (!Number.isSafeInteger(amountPaise) || amountPaise === 0) return null;
  return {
    firmId: order.firmId,
    retailerId: order.retailerId,
    kind: "adjustment",
    amountPaise,
    orderId: order.id,
  };
}

/** Opening balance: one per retailer + firm. Zero is not allowed (nothing to record). */
export function openingEntry(
  existing: readonly { kind: string; firmId: string; retailerId: string }[],
  retailerId: string,
  firmId: string,
  amountPaise: number,
): EntryResult {
  if (!Number.isInteger(amountPaise) || amountPaise === 0) {
    return { ok: false, error: "Enter an amount in whole paise that is not zero." };
  }
  if (Math.abs(amountPaise) > MAX_OPENING_PAISE) return { ok: false, error: "That amount is too large." };
  if (existing.some((e) => e.kind === "opening" && e.retailerId === retailerId && e.firmId === firmId)) {
    return { ok: false, error: "Opening balance is already set for this retailer and firm." };
  }
  return { ok: true, entry: { firmId, retailerId, kind: "opening", amountPaise } };
}

/** Which roles may see all retailers' ledgers; a retailer sees only their own. */
export function canViewLedger(
  roles: { admin: boolean; accounts: boolean; sales: boolean; retailer: boolean },
  ownRetailerId: string | null,
  retailerId: string,
): boolean {
  if (roles.admin || roles.accounts || roles.sales) return true;
  return roles.retailer && ownRetailerId !== null && ownRetailerId === retailerId;
}
