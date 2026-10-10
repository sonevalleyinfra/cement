"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { brands, supplierLedgerEntries } from "@/db/schema";
import { toISTDateKey } from "@/lib/datetime";
import { isUniqueViolation } from "@/lib/db-errors";
import { isUuid } from "@/lib/ids";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import {
  adjustmentEntry,
  checkEntryDate,
  creditEntry,
  openingEntry,
  paymentEntry,
  type SupplierResult,
} from "@/lib/supplier-rules";
import { postSupplierEntry } from "@/lib/suppliers";

export type SupplierActionResult = { ok: true } | { ok: false; error: string };

/** Admin only. Returns who is acting and the entry date (empty = today in India). */
async function prepare(entryDate: unknown) {
  const session = await requireRole(...rolesFor("manageSuppliers"));
  const today = toISTDateKey(new Date());
  const date = checkEntryDate(typeof entryDate === "string" && entryDate.trim() ? entryDate : today, today);
  return { session, date };
}

/**
 * Saves the entry the rules built (and its activity-log line) on one brand's account, then
 * refreshes the screens. The brand must exist (a switched-off brand can still be paid).
 */
async function save(
  actorId: string,
  brandId: unknown,
  build: (existing: { brandId: string; kind: string }[], date: string) => SupplierResult,
  date: string,
): Promise<SupplierActionResult> {
  if (!isUuid(brandId)) return { ok: false, error: "Pick a brand." };
  try {
    const res = await db.transaction(async (tx): Promise<SupplierActionResult> => {
      const [brand] = await tx.select({ id: brands.id }).from(brands).where(eq(brands.id, brandId));
      if (!brand) return { ok: false, error: "Pick a brand." };
      const existing = await tx
        .select({ brandId: supplierLedgerEntries.brandId, kind: supplierLedgerEntries.kind })
        .from(supplierLedgerEntries)
        .where(and(eq(supplierLedgerEntries.brandId, brandId), eq(supplierLedgerEntries.kind, "opening")));
      const plan = build(existing, date);
      if (!plan.ok) return plan;
      await postSupplierEntry(tx, plan.entry, actorId);
      return { ok: true };
    });
    if (res.ok) {
      revalidatePath("/suppliers", "layout");
      revalidatePath("/dashboard");
    }
    return res;
  } catch (e) {
    // Two taps at once: the database allows only one opening balance per brand.
    if (isUniqueViolation(e, "supplier_ledger_entries_one_opening_idx")) {
      return { ok: false, error: "Opening balance is already set." };
    }
    throw e;
  }
}

/** Opening balance, once per brand. `weOwe` false means the supplier owes us. */
export async function setSupplierOpening(input: {
  brandId: string;
  amountPaise: number;
  weOwe: boolean;
  entryDate?: string;
}): Promise<SupplierActionResult> {
  const { session, date } = await prepare(input?.entryDate);
  if (!date.ok) return date;
  const amount = Number(input.amountPaise);
  return save(
    session.user.id,
    input.brandId,
    (existing, d) => openingEntry(existing, input.brandId, input.weOwe ? amount : -amount, d),
    date.date,
  );
}

/** A payment to the brand's supplier: amount, mode (bank / cash / other) and a reference. */
export async function recordSupplierPayment(input: {
  brandId: string;
  amountPaise: number;
  mode: string;
  reference: string;
  entryDate?: string;
}): Promise<SupplierActionResult> {
  const { session, date } = await prepare(input?.entryDate);
  if (!date.ok) return date;
  return save(
    session.user.id,
    input.brandId,
    (_, d) => paymentEntry(input.brandId, Number(input.amountPaise), input.mode, input.reference, d),
    date.date,
  );
}

/** A scheme / discount credit from the brand's supplier. A reason is required. */
export async function recordSupplierCredit(input: {
  brandId: string;
  amountPaise: number;
  reason: string;
  entryDate?: string;
}): Promise<SupplierActionResult> {
  const { session, date } = await prepare(input?.entryDate);
  if (!date.ok) return date;
  return save(
    session.user.id,
    input.brandId,
    (_, d) => creditEntry(input.brandId, Number(input.amountPaise), input.reason, d),
    date.date,
  );
}

/** A fix: `amountPaise` is signed (+ we owe more, - we owe less). A reason is required. */
export async function addSupplierAdjustment(input: {
  brandId: string;
  amountPaise: number;
  reason: string;
  entryDate?: string;
}): Promise<SupplierActionResult> {
  const { session, date } = await prepare(input?.entryDate);
  if (!date.ok) return date;
  return save(
    session.user.id,
    input.brandId,
    (_, d) => adjustmentEntry(input.brandId, Number(input.amountPaise), input.reason, d),
    date.date,
  );
}
