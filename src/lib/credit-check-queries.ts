/**
 * Reads what the credit check needs about some shops (credit-check-rules.ts), one query per kind for
 * all of them: credit terms, ledger rows (balance and overdue), bags not sent on approved / partly
 * dispatched orders, and the last standing payment.
 *
 * Takes the connection or open transaction and never imports `@/db` or `@/env`, so the approval
 * (order-approval.ts, inside its transaction after the shop's lock) and the approvals page
 * (credit-check.ts) read the same way, and the race test can run it on its own pool.
 */
import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import { dispatches, ledgerEntries, orders, receipts, retailers } from "@/db/schema";
import { NOT_SENT_STATUSES, notSentPaise, oldestOverdueDays, type OpenOrder, type ShopCreditFacts } from "@/lib/credit-check-rules";
import type { LedgerRow } from "@/lib/due-items";
import { LAST_PAYMENT_SKIPS } from "@/lib/home-rules";
import { ledgerMomentSql } from "@/lib/ledger-sql";

/** A database or an open transaction on the app's schema. */
export type CreditConn = Pick<PostgresJsDatabase<typeof schema>, "select" | "selectDistinctOn">;

function group<T extends { retailerId: string }>(rows: readonly T[]): Map<string, T[]> {
  const by = new Map<string, T[]>();
  for (const r of rows) {
    const list = by.get(r.retailerId) ?? [];
    list.push(r);
    by.set(r.retailerId, list);
  }
  return by;
}

/**
 * The credit facts of each shop in `retailerIds`, as of the India day `asOfKey`. A shop that does not
 * exist is left out. Placed orders never count as not sent (they are not approved yet).
 */
export async function readCreditFacts(
  conn: CreditConn,
  retailerIds: readonly string[],
  asOfKey: string,
): Promise<Map<string, ShopCreditFacts>> {
  const ids = [...new Set(retailerIds)];
  const out = new Map<string, ShopCreditFacts>();
  if (ids.length === 0) return out;

  // Statements run one after the other: inside a transaction they share one connection anyway.
  const shops = await conn
    .select({
      id: retailers.id,
      limitPaise: retailers.creditLimitPaise,
      creditDays: retailers.creditDays,
      status: retailers.creditStatus,
    })
    .from(retailers)
    .where(inArray(retailers.id, ids));
  const ledger = await conn
    .select({
      retailerId: ledgerEntries.retailerId,
      kind: ledgerEntries.kind,
      amountPaise: ledgerEntries.amountPaise,
      orderId: ledgerEntries.orderId,
      // A payment counts on the day it was received.
      createdAt: ledgerMomentSql,
    })
    .from(ledgerEntries)
    .leftJoin(receipts, eq(receipts.id, ledgerEntries.receiptId))
    .where(inArray(ledgerEntries.retailerId, ids))
    .orderBy(asc(ledgerMomentSql), asc(ledgerEntries.id));
  // A join + group by, not a correlated subquery: inside `(select … from dispatches where … = ${orders.id})`
  // drizzle may print the outer column unqualified ("id"), which then means dispatches.id and sums nothing.
  const open = await conn
    .select({
      retailerId: orders.retailerId,
      bags: orders.bags,
      ratePaise: orders.ratePaise,
      dispatchedBags: sql<number>`coalesce(sum(${dispatches.bags}), 0)`.mapWith(Number),
    })
    .from(orders)
    .leftJoin(dispatches, eq(dispatches.orderId, orders.id))
    .where(and(inArray(orders.retailerId, ids), inArray(orders.status, [...NOT_SENT_STATUSES])))
    .groupBy(orders.id);
  // The newest payment per shop that still stands (not rejected or reversed), by the day it was received.
  const payments = await conn
    .selectDistinctOn([receipts.retailerId], {
      retailerId: receipts.retailerId,
      totalPaise: receipts.totalPaise,
      receivedOn: receipts.receivedOn,
    })
    .from(receipts)
    .where(and(inArray(receipts.retailerId, ids), notInArray(receipts.status, [...LAST_PAYMENT_SKIPS])))
    .orderBy(receipts.retailerId, desc(receipts.receivedOn), desc(receipts.createdAt));

  const rowsBy = group<LedgerRow & { retailerId: string }>(ledger);
  const openBy = group<OpenOrder & { retailerId: string }>(open);
  const lastBy = new Map(payments.map((p) => [p.retailerId, { totalPaise: p.totalPaise, receivedOn: p.receivedOn }]));
  for (const s of shops) {
    const rows = rowsBy.get(s.id) ?? [];
    out.set(s.id, {
      balancePaise: rows.reduce((n, r) => n + r.amountPaise, 0),
      notSentPaise: notSentPaise(openBy.get(s.id) ?? []),
      oldestOverdueDays: oldestOverdueDays(rows, s.creditDays, asOfKey),
      limitPaise: s.limitPaise,
      creditDays: s.creditDays,
      status: s.status,
      lastPayment: lastBy.get(s.id) ?? null,
    });
  }
  return out;
}
