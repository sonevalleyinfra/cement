import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { prismLedgerEntries } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import type { DbOrTx } from "@/lib/ledger";
import type { PrismEntry } from "@/lib/prism-rules";

/**
 * Appends one row to the Prism account and writes it to the activity log, in the same
 * transaction. Rows are never edited or deleted. Server-only.
 */
export async function postPrismEntry(
  tx: DbOrTx,
  entry: PrismEntry,
  actorId: string,
  stockMovementId: string | null = null,
): Promise<string> {
  const [row] = await tx
    .insert(prismLedgerEntries)
    .values({
      kind: entry.kind,
      amountPaise: entry.amountPaise,
      entryDate: entry.entryDate,
      stockMovementId,
      mode: entry.mode,
      reference: entry.reference,
      note: entry.note,
      actorId,
    })
    .returning({ id: prismLedgerEntries.id });
  await writeAudit(tx, {
    actorId,
    entity: "prism_entry",
    entityId: row.id,
    action: entry.kind,
    details: {
      amountPaise: entry.amountPaise,
      entryDate: entry.entryDate,
      mode: entry.mode,
      reference: entry.reference,
      note: entry.note,
      stockMovementId,
    },
  });
  return row.id;
}

/** What we owe Prism now (negative = Prism owes us): the sum of every entry. */
export async function getPrismBalance(conn: Pick<typeof db, "select"> = db): Promise<number> {
  const [row] = await conn
    .select({ p: sql<number>`coalesce(sum(${prismLedgerEntries.amountPaise}), 0)`.mapWith(Number) })
    .from(prismLedgerEntries);
  return row?.p ?? 0;
}

/** The newest entries first (by their date, then when they were saved). */
export async function getPrismEntries(limit: number) {
  return db
    .select()
    .from(prismLedgerEntries)
    .orderBy(desc(prismLedgerEntries.entryDate), desc(prismLedgerEntries.createdAt), desc(prismLedgerEntries.id))
    .limit(limit);
}

/** True once the opening balance has been set. */
export async function hasPrismOpening(): Promise<boolean> {
  const [row] = await db
    .select({ id: prismLedgerEntries.id })
    .from(prismLedgerEntries)
    .where(eq(prismLedgerEntries.kind, "opening"))
    .limit(1);
  return Boolean(row);
}
