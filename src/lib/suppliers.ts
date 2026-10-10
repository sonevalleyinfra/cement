import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { brands, supplierLedgerEntries } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import type { DbOrTx } from "@/lib/ledger";
import { suppliersToShow, type SupplierEntry } from "@/lib/supplier-rules";

/**
 * Appends one row to a brand's supplier account and writes it to the activity log, in the same
 * transaction. Rows are never edited or deleted. Server-only.
 * A purchase passes `audit: false`: its one activity row is the stock purchase (which names the
 * amount owed and the brand), so one action gives one row.
 */
export async function postSupplierEntry(
  tx: DbOrTx,
  entry: SupplierEntry,
  actorId: string,
  stockMovementId: string | null = null,
  { audit = true }: { audit?: boolean } = {},
): Promise<string> {
  const [row] = await tx
    .insert(supplierLedgerEntries)
    .values({
      brandId: entry.brandId,
      kind: entry.kind,
      amountPaise: entry.amountPaise,
      entryDate: entry.entryDate,
      stockMovementId,
      mode: entry.mode,
      reference: entry.reference,
      note: entry.note,
      actorId,
    })
    .returning({ id: supplierLedgerEntries.id });
  if (!audit) return row.id;
  await writeAudit(tx, {
    actorId,
    entity: "supplier_entry",
    entityId: row.id,
    action: entry.kind,
    details: {
      brandId: entry.brandId,
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

/** Balance and number of entries per brand (brands with no entries are left out). */
async function totalsByBrand(conn: Pick<typeof db, "select"> = db) {
  return conn
    .select({
      brandId: supplierLedgerEntries.brandId,
      balancePaise: sql<number>`coalesce(sum(${supplierLedgerEntries.amountPaise}), 0)`.mapWith(Number),
      entries: count(),
    })
    .from(supplierLedgerEntries)
    .groupBy(supplierLedgerEntries.brandId);
}

/**
 * The suppliers list: every switched-on brand and any switched-off brand that still has entries,
 * each with what we owe it (negative = it owes us). By name.
 */
export async function getSuppliers() {
  const [brandRows, totals] = await Promise.all([
    db.select({ id: brands.id, name: brands.name, active: brands.active }).from(brands),
    totalsByBrand(),
  ]);
  return suppliersToShow(brandRows, totals);
}

/** One brand (for its account page), or null. */
export async function getBrand(brandId: string) {
  const [row] = await db
    .select({ id: brands.id, name: brands.name, active: brands.active })
    .from(brands)
    .where(eq(brands.id, brandId));
  return row ?? null;
}

/** What we owe one brand's supplier now (negative = it owes us): the sum of its entries. */
export async function getSupplierBalance(brandId: string): Promise<number> {
  const [row] = await db
    .select({ p: sql<number>`coalesce(sum(${supplierLedgerEntries.amountPaise}), 0)`.mapWith(Number) })
    .from(supplierLedgerEntries)
    .where(eq(supplierLedgerEntries.brandId, brandId));
  return row?.p ?? 0;
}

/** One brand's newest entries first (by their date, then when they were saved). */
export async function getSupplierEntries(brandId: string, limit: number) {
  return db
    .select()
    .from(supplierLedgerEntries)
    .where(eq(supplierLedgerEntries.brandId, brandId))
    .orderBy(desc(supplierLedgerEntries.entryDate), desc(supplierLedgerEntries.createdAt), desc(supplierLedgerEntries.id))
    .limit(limit);
}

/** True once this brand's opening balance has been set. */
export async function hasSupplierOpening(brandId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: supplierLedgerEntries.id })
    .from(supplierLedgerEntries)
    .where(and(eq(supplierLedgerEntries.brandId, brandId), eq(supplierLedgerEntries.kind, "opening")))
    .limit(1);
  return Boolean(row);
}

/** Brands for pickers (statement): every brand that has entries or is switched on, by name, with how many entries. */
export async function supplierOptions() {
  return (await getSuppliers()).map((s) => ({ id: s.id, name: s.name, entries: s.entries }));
}
