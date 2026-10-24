import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { dispatches, ledgerEntries, orders, products, receipts } from "@/db/schema";
import type { LedgerEntry } from "@/lib/ledger-rules";

/** A database or a transaction. */
export type DbOrTx = Pick<typeof db, "insert" | "select">;

/** Appends one row and returns its id. Rows are never edited or deleted. */
export async function postEntry(
  tx: DbOrTx,
  entry: LedgerEntry,
  actorId: string,
  note = "",
  receiptId: string | null = null,
): Promise<string> {
  const [row] = await tx.insert(ledgerEntries).values({
    retailerId: entry.retailerId,
    kind: entry.kind,
    amountPaise: entry.amountPaise,
    orderId: entry.orderId ?? null,
    receiptId,
    note: note.slice(0, 300),
    actorId,
  }).returning({ id: ledgerEntries.id });
  return row.id;
}

/**
 * The moment a ledger row counts at (ledger, aging, statement). A payment credit (`receipt_credit`,
 * minus) whose payment was received on an earlier India day than the row was posted counts at the last
 * millisecond of that received day; every other row (dispatches, adjustments, reversals, and the old
 * + receipt_credit reversal rows) counts at `created_at`. Exactly mirrors `paymentMoment` in
 * lib/receipt-rules.ts. Needs `leftJoin(receipts, eq(receipts.id, ledgerEntries.receiptId))`.
 */
export const ledgerMomentSql = sql<Date>`case when ${ledgerEntries.kind} = 'receipt_credit' and ${ledgerEntries.amountPaise} < 0 and ${receipts.receivedOn} < (${ledgerEntries.createdAt} at time zone 'Asia/Kolkata')::date then ((${receipts.receivedOn} + 1)::timestamp at time zone 'Asia/Kolkata') - interval '1 millisecond' else ${ledgerEntries.createdAt} end`.mapWith(
  ledgerEntries.createdAt,
);

/** True when the row counts on an earlier day than it was posted (show its date only, no time). */
export const ledgerBackdatedSql = sql<boolean>`coalesce(${ledgerEntries.kind} = 'receipt_credit' and ${ledgerEntries.amountPaise} < 0 and ${receipts.receivedOn} < (${ledgerEntries.createdAt} at time zone 'Asia/Kolkata')::date, false)`.mapWith(
  Boolean,
);

/** Net balance per retailer (for the list cards; positive = retailer owes). Server-only. */
export async function getAllBalances(conn: Pick<typeof db, "select"> = db) {
  return conn
    .select({
      retailerId: ledgerEntries.retailerId,
      balancePaise: sql<number>`coalesce(sum(${ledgerEntries.amountPaise}), 0)`.mapWith(Number),
    })
    .from(ledgerEntries)
    .groupBy(ledgerEntries.retailerId);
}

/** Net balance of one retailer (positive = owes, negative = advance). Server-only. */
export async function getBalance(retailerId: string, conn: Pick<typeof db, "select"> = db): Promise<number> {
  const [row] = await conn
    .select({ balancePaise: sql<number>`coalesce(sum(${ledgerEntries.amountPaise}), 0)`.mapWith(Number) })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.retailerId, retailerId));
  return row?.balancePaise ?? 0;
}

/**
 * All entries for one retailer, oldest first. A dispatch row also gets its product and bags (its
 * dispatch was saved in the same transaction: same order, same moment), so a retailer can be shown
 * "what came" without the amount. `createdAt` is the ledger moment (`ledgerMomentSql`: a payment
 * counts on the day it was received); `backdated` marks such a payment row.
 */
export async function getEntries(retailerId: string) {
  return db
    .select({
      id: ledgerEntries.id,
      kind: ledgerEntries.kind,
      amountPaise: ledgerEntries.amountPaise,
      note: ledgerEntries.note,
      actorId: ledgerEntries.actorId,
      createdAt: ledgerMomentSql,
      backdated: ledgerBackdatedSql,
      product: products.name,
      bags: dispatches.bags,
    })
    .from(ledgerEntries)
    .leftJoin(receipts, eq(receipts.id, ledgerEntries.receiptId))
    .leftJoin(orders, eq(orders.id, ledgerEntries.orderId))
    .leftJoin(products, eq(products.id, orders.productId))
    .leftJoin(
      dispatches,
      and(eq(dispatches.orderId, ledgerEntries.orderId), eq(dispatches.createdAt, ledgerEntries.createdAt)),
    )
    .where(eq(ledgerEntries.retailerId, retailerId))
    .orderBy(asc(ledgerMomentSql), asc(ledgerEntries.id));
}
