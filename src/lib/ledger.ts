import { and, asc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { dispatches, ledgerEntries, orders, products, receipts } from "@/db/schema";
import { ledgerBackdatedSql, ledgerMomentSql } from "@/lib/ledger-sql";
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

export { ledgerBackdatedSql, ledgerMomentSql, ledgerReversesAtSql } from "@/lib/ledger-sql";

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
 * "what came" without the amount; a dispatch_reversal row gets its (minus) bags from its reversal row. `createdAt` is the ledger moment (`ledgerMomentSql`: a payment
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
      or(
        // A dispatch_reversal row names its reversal dispatch row (minus bags, v2 B2).
        eq(dispatches.id, ledgerEntries.dispatchId),
        and(
          isNull(ledgerEntries.dispatchId),
          eq(dispatches.orderId, ledgerEntries.orderId),
          eq(dispatches.createdAt, ledgerEntries.createdAt),
          gt(dispatches.bags, 0),
        ),
      ),
    )
    .where(eq(ledgerEntries.retailerId, retailerId))
    .orderBy(asc(ledgerMomentSql), asc(ledgerEntries.id));
}
