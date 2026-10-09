import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { firms, ledgerEntries, receiptAllocations } from "@/db/schema";
import { firmDuesFromLedger, type FirmDues } from "@/lib/firm-dues";
import { firmLines, type PostingLine } from "@/lib/receipt-rules";

/** A database or a transaction. */
type Conn = Pick<typeof db, "select">;

/**
 * What one retailer owes each of the given firms, read from the ledger (see firm-dues.ts).
 * Firms come back in the order of `firmIds`; firms with no ledger rows are left out.
 * Server-only. Pass the transaction to read inside it (after locking the retailer).
 */
export async function getFirmDues(retailerId: string, firmIds: readonly string[], conn: Conn = db): Promise<FirmDues[]> {
  if (firmIds.length === 0) return [];
  const rows = await conn
    .select({
      firmId: ledgerEntries.firmId,
      kind: ledgerEntries.kind,
      amountPaise: ledgerEntries.amountPaise,
      orderId: ledgerEntries.orderId,
      createdAt: ledgerEntries.createdAt,
    })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.retailerId, retailerId), inArray(ledgerEntries.firmId, [...firmIds])))
    .orderBy(asc(ledgerEntries.createdAt), asc(ledgerEntries.id));
  const byFirm = new Map(firmDuesFromLedger(rows).map((f) => [f.firmId, f]));
  return firmIds.flatMap((id) => {
    const f = byFirm.get(id);
    return f ? [f] : [];
  });
}

/** A receipt's posting lines, one per firm (allocations + advance, old per-order rows too). */
export async function getReceiptLines(receiptId: string, conn: Conn = db): Promise<PostingLine[]> {
  const rows = await conn
    .select({ firmId: receiptAllocations.firmId, amountPaise: receiptAllocations.amountPaise })
    .from(receiptAllocations)
    .where(eq(receiptAllocations.receiptId, receiptId));
  return firmLines(rows);
}

/** Firm names for these ids, in the same order (unknown ids are skipped). */
export async function getFirmNames(firmIds: readonly string[], conn: Conn = db): Promise<string[]> {
  if (firmIds.length === 0) return [];
  const rows = await conn.select({ id: firms.id, name: firms.name }).from(firms).where(inArray(firms.id, [...firmIds]));
  const byId = new Map(rows.map((r) => [r.id, r.name]));
  return firmIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
}
