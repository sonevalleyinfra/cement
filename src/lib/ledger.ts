import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { firms, ledgerEntries } from "@/db/schema";
import type { LedgerEntry } from "@/lib/ledger-rules";

/** A database or a transaction. */
export type DbOrTx = Pick<typeof db, "insert" | "select">;

/** Appends one row. Rows are never edited or deleted. */
export async function postEntry(
  tx: DbOrTx,
  entry: LedgerEntry,
  actorId: string,
  note = "",
): Promise<void> {
  await tx.insert(ledgerEntries).values({
    firmId: entry.firmId,
    retailerId: entry.retailerId,
    kind: entry.kind,
    amountPaise: entry.amountPaise,
    orderId: entry.orderId ?? null,
    note: note.slice(0, 300),
    actorId,
  });
}

/** Net balance per firm for one retailer (positive = retailer owes). Server-only. */
export async function getRetailerBalances(retailerId: string) {
  return db
    .select({
      firmId: ledgerEntries.firmId,
      firmName: firms.name,
      firmSlot: firms.slot,
      balancePaise: sql<number>`coalesce(sum(${ledgerEntries.amountPaise}), 0)::int`,
    })
    .from(ledgerEntries)
    .innerJoin(firms, eq(firms.id, ledgerEntries.firmId))
    .where(eq(ledgerEntries.retailerId, retailerId))
    .groupBy(ledgerEntries.firmId, firms.name, firms.slot)
    .orderBy(asc(firms.slot));
}

/** Net balance per retailer and firm (for the list cards). Server-only. */
export async function getAllBalances(firmIds: string[]) {
  if (firmIds.length === 0) return [];
  return db
    .select({
      retailerId: ledgerEntries.retailerId,
      firmId: ledgerEntries.firmId,
      balancePaise: sql<number>`coalesce(sum(${ledgerEntries.amountPaise}), 0)::int`,
    })
    .from(ledgerEntries)
    .where(sql`${ledgerEntries.firmId} in ${firmIds}`)
    .groupBy(ledgerEntries.retailerId, ledgerEntries.firmId);
}

/** All entries for one retailer with one firm, oldest first. */
export async function getEntries(retailerId: string, firmId: string) {
  return db
    .select()
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.retailerId, retailerId), eq(ledgerEntries.firmId, firmId)))
    .orderBy(asc(ledgerEntries.createdAt), asc(ledgerEntries.id));
}
