import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { ledgerEntries } from "@/db/schema";
import type { LedgerEntry } from "@/lib/ledger-rules";

/** A database or a transaction. */
export type DbOrTx = Pick<typeof db, "insert" | "select">;

/** Appends one row. Rows are never edited or deleted. */
export async function postEntry(
  tx: DbOrTx,
  entry: LedgerEntry,
  actorId: string,
  note = "",
  receiptId: string | null = null,
): Promise<void> {
  await tx.insert(ledgerEntries).values({
    retailerId: entry.retailerId,
    kind: entry.kind,
    amountPaise: entry.amountPaise,
    orderId: entry.orderId ?? null,
    receiptId,
    note: note.slice(0, 300),
    actorId,
  });
}

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

/** All entries for one retailer, oldest first. */
export async function getEntries(retailerId: string) {
  return db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.retailerId, retailerId))
    .orderBy(asc(ledgerEntries.createdAt), asc(ledgerEntries.id));
}
