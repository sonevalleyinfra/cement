/**
 * The credit check at order approval (cement v2 B1, owner decision D2: soft block). Plain functions:
 * no database, so they are easy to test.
 *
 * - Exposure after this order = dues (the ledger balance: minus = advance, which lowers it)
 *   + not sent (the bags still to go on the shop's OTHER approved / partly dispatched orders, at their
 *   rate) + this order (bags × rate).
 * - Over the limit = strictly more than the limit (equal is fine). No limit set = never over the
 *   limit (amber "No limit set"); the 30-day default terms still apply to overdue.
 * - Overdue = the oldest due item past the shop's credit days (FIFO, `overdueOf`), as of today in India.
 * - Over the limit, overdue, or the shop on hold / blocked → red: accounts or admin approve only with
 *   an override reason (reason-codes OVERRIDE_REASONS). The server decides, never the screen.
 */
import { effectiveCreditDays } from "./credit-rules";
import { formatDayMonth } from "./datetime";
import type { LedgerRow } from "./due-items";
import { duesFromLedger } from "./due-items";
import { formatINR } from "./money";
import { lastPaymentDay, overdueOf, type LastPayment } from "./overdue-rules";
import { reasonLabel } from "./reason-codes";
import { daysText, formatCount } from "./words";

/** Order statuses whose bags not sent yet count as exposure. */
export const NOT_SENT_STATUSES = ["approved", "partly_dispatched"] as const;

/** Why a card is red, in the order the headline lines are shown. */
export const CREDIT_FLAGS = ["over_limit", "overdue", "hold", "blocked"] as const;
export type CreditFlag = (typeof CREDIT_FLAGS)[number];

export const MAX_HEADLINES = 3;

/** Another order of the shop that is approved or partly dispatched. */
export type OpenOrder = { bags: number; dispatchedBags: number; ratePaise: number | null };

/** (bags − dispatched) × rate, summed. Never negative per order; an order with no rate counts 0. */
export function notSentPaise(orders: readonly OpenOrder[]): number {
  let total = 0;
  for (const o of orders) {
    if (o.ratePaise === null) continue;
    total += Math.max(0, o.bags - o.dispatchedBags) * o.ratePaise;
  }
  return total;
}

/** Days the oldest due item is past the shop's terms (0 = nothing overdue). Ledger rows oldest first. */
export function oldestOverdueDays(rows: readonly LedgerRow[], creditDays: number | null, asOfKey: string): number {
  return overdueOf(duesFromLedger(rows).items, creditDays, asOfKey).oldestDaysPastTerms;
}

/** What the server reads about one shop (everything except the order being approved). */
export type ShopCreditFacts = {
  /** Ledger balance in paise (+ owes, − advance). */
  balancePaise: number;
  notSentPaise: number;
  oldestOverdueDays: number;
  limitPaise: number | null;
  /** As stored (null = the 30-day default). */
  creditDays: number | null;
  status: string;
  lastPayment: LastPayment | null;
};

export type CreditAssessment = {
  balancePaise: number;
  notSentPaise: number;
  thisOrderPaise: number;
  /** Exposure after this order. */
  afterPaise: number;
  limitPaise: number | null;
  noLimit: boolean;
  overLimitByPaise: number;
  /** The part of THIS order that went over the limit (what an override adds up in reports). */
  overLimitPaiseApproved: number;
  oldestOverdueDays: number;
  /** The credit days that apply (the shop's own, or 30). */
  creditDays: number;
  status: string;
  flags: CreditFlag[];
  needsOverride: boolean;
  /** Up to 3 red lines, over-limit first: "Over limit by ₹38,000", "Overdue 42 days", "Shop on hold". */
  headlines: string[];
  lastPayment: LastPayment | null;
};

const money = (p: number) => formatINR(p, { hidePaise: true });

const HEADLINE: Record<CreditFlag, (a: Pick<CreditAssessment, "overLimitByPaise" | "oldestOverdueDays">) => string> = {
  over_limit: (a) => `Over limit by ${money(a.overLimitByPaise)}`,
  overdue: (a) => `Overdue ${daysText(a.oldestOverdueDays)}`,
  hold: () => "Shop on hold",
  blocked: () => "Shop blocked",
};

/** The credit check for one order: all numbers, the red flags and the headline lines. */
export function assessCredit(facts: ShopCreditFacts, thisOrderPaise: number): CreditAssessment {
  for (const v of [facts.balancePaise, facts.notSentPaise, thisOrderPaise]) {
    if (!Number.isSafeInteger(v)) throw new RangeError("Credit amounts must be whole paise");
  }
  const afterPaise = facts.balancePaise + facts.notSentPaise + thisOrderPaise;
  const limit = facts.limitPaise;
  const overLimitByPaise = limit !== null ? Math.max(0, afterPaise - limit) : 0;
  const days = Math.max(0, facts.oldestOverdueDays);
  const flags = CREDIT_FLAGS.filter((f) => {
    if (f === "over_limit") return overLimitByPaise > 0;
    if (f === "overdue") return days > 0;
    return facts.status === f;
  });
  const parts = { overLimitByPaise, oldestOverdueDays: days };
  return {
    balancePaise: facts.balancePaise,
    notSentPaise: facts.notSentPaise,
    thisOrderPaise,
    afterPaise,
    limitPaise: limit,
    noLimit: limit === null,
    overLimitByPaise,
    overLimitPaiseApproved: Math.max(0, Math.min(thisOrderPaise, overLimitByPaise)),
    oldestOverdueDays: days,
    creditDays: effectiveCreditDays(facts.creditDays),
    status: facts.status,
    flags,
    needsOverride: flags.length > 0,
    headlines: flags.slice(0, MAX_HEADLINES).map((f) => HEADLINE[f](parts)),
    lastPayment: facts.lastPayment,
  };
}

/** The error when an approval needs a reason but none was sent (short, fits the first flag). */
export function overrideNeededError(flags: readonly CreditFlag[]): string {
  switch (flags[0]) {
    case "over_limit":
      return "Over the limit now. Pick a reason.";
    case "overdue":
      return "Dues are overdue. Pick a reason.";
    case "hold":
      return "Shop is on hold. Pick a reason.";
    default:
      return "Shop is blocked. Pick a reason.";
  }
}

const PILL: Record<CreditFlag, string> = { over_limit: "Over limit", overdue: "Overdue", hold: "On hold", blocked: "Blocked" };

/** The small pill next to a red card's shop name, or null when the card is not red. */
export function creditPill(flags: readonly CreditFlag[]): string | null {
  return flags.length > 0 ? PILL[flags[0]] : null;
}

/** How full the meter is, 0–100 (clamped full when over). Null when there is no limit. */
export function meterPercent(afterPaise: number, limitPaise: number | null): number | null {
  if (limitPaise === null) return null;
  if (afterPaise <= 0) return 0;
  if (limitPaise <= 0 || afterPaise >= limitPaise) return 100;
  return Math.round((afterPaise * 100) / limitPaise);
}

/** "Due ₹1,00,000 · Not sent ₹20,000 · This ₹18,000" ("Advance ₹5,000" instead of Due when paid ahead). */
export function exposureLine(a: Pick<CreditAssessment, "balancePaise" | "notSentPaise" | "thisOrderPaise">): string {
  const first = a.balancePaise < 0 ? `Advance ${money(-a.balancePaise)}` : `Due ${money(a.balancePaise)}`;
  return `${first} · Not sent ${money(a.notSentPaise)} · This ${money(a.thisOrderPaise)}`;
}

/** "30-day terms" (the shop's own days when set). */
export function termsText(creditDays: number): string {
  return `${formatCount(creditDays)}-day terms`;
}

/** "₹25,000 · 12 Oct", or "None". */
export function lastPaymentText(p: LastPayment | null): string {
  return p ? `${money(p.totalPaise)} · ${formatDayMonth(lastPaymentDay(p))}` : "None";
}

/* ---------- Overrides counted (report and owner Home) ---------- */

export type OverrideRow = { reasonCode: string; orderPaise: number; overLimitPaise: number };

export type OverrideTotals = { count: number; overLimitPaise: number; orderPaise: number };

export function overrideTotals(rows: readonly Pick<OverrideRow, "orderPaise" | "overLimitPaise">[]): OverrideTotals {
  return rows.reduce<OverrideTotals>(
    (t, r) => ({ count: t.count + 1, overLimitPaise: t.overLimitPaise + r.overLimitPaise, orderPaise: t.orderPaise + r.orderPaise }),
    { count: 0, overLimitPaise: 0, orderPaise: 0 },
  );
}

/** Count per reason, most first (then by label). */
export function overridesByReason(rows: readonly Pick<OverrideRow, "reasonCode">[]): { code: string; label: string; count: number }[] {
  const by = new Map<string, number>();
  for (const r of rows) by.set(r.reasonCode, (by.get(r.reasonCode) ?? 0) + 1);
  return [...by]
    .map(([code, count]) => ({ code, label: reasonLabel(code, "override") || code, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** The owner Home row: "3 overrides this month · ₹38,000 over limit" ("No overrides this month" at 0). */
export function overridesMonthText(t: Pick<OverrideTotals, "count" | "overLimitPaise">): string {
  if (t.count === 0) return "No overrides this month";
  const n = `${formatCount(t.count)} ${t.count === 1 ? "override" : "overrides"} this month`;
  return t.overLimitPaise > 0 ? `${n} · ${money(t.overLimitPaise)} over limit` : n;
}
