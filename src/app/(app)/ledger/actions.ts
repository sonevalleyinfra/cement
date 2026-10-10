"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { ledgerEntries, retailers } from "@/db/schema";
import { isUuid } from "@/lib/ids";
import { postEntry } from "@/lib/ledger";
import { adjustmentEntry, openingEntry } from "@/lib/ledger-rules";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";

export type LedgerResult = { ok: true } | { ok: false; error: string };

/** Admin sets the opening balance for one retailer (once). `owes` false = advance. */
export async function setOpeningBalance(input: {
  retailerId: string;
  rupeeDigits: string;
  owes: boolean;
}): Promise<LedgerResult> {
  const session = await requireRole(...rolesFor("setOpeningBalance"));
  if (!isUuid(input.retailerId)) return { ok: false, error: "Retailer not found." };
  if (typeof input.rupeeDigits !== "string" || !/^\d{1,9}$/.test(input.rupeeDigits)) return { ok: false, error: "Enter the amount." };
  const paise = Number(input.rupeeDigits) * 100;
  const signed = input.owes ? paise : -paise;

  const [retailer] = await db.select({ id: retailers.id }).from(retailers).where(eq(retailers.id, input.retailerId)).limit(1);
  if (!retailer) return { ok: false, error: "Retailer not found." };

  const res = await db.transaction(async (tx): Promise<LedgerResult> => {
    // Lock the retailer so two clicks cannot both post an opening balance.
    await tx.select({ id: retailers.id }).from(retailers).where(eq(retailers.id, input.retailerId)).for("no key update");
    const existing = await tx
      .select({ kind: ledgerEntries.kind, retailerId: ledgerEntries.retailerId })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.retailerId, input.retailerId), eq(ledgerEntries.kind, "opening")));
    const entry = openingEntry(existing, input.retailerId, signed);
    if (!entry.ok) return entry;
    await postEntry(tx, entry.entry, session.user.id, "Opening balance");
    return { ok: true };
  });
  if (res.ok) {
    revalidatePath("/ledger");
    revalidatePath(`/ledger/${input.retailerId}`);
    revalidatePath("/approvals");
  }
  return res;
}

/**
 * Admin adds an adjustment to one retailer's ledger: `amountPaise` is signed
 * (+ the retailer owes more, - owes less). A reason is required.
 */
export async function addAdjustment(input: {
  retailerId: string;
  amountPaise: number;
  reason: string;
}): Promise<LedgerResult> {
  const session = await requireRole(...rolesFor("adjustLedger"));
  if (!isUuid(input?.retailerId)) return { ok: false, error: "Retailer not found." };
  const plan = adjustmentEntry(input.retailerId, Number(input.amountPaise), input.reason);
  if (!plan.ok) return plan;
  const res = await db.transaction(async (tx): Promise<LedgerResult> => {
    const [retailer] = await tx
      .select({ id: retailers.id })
      .from(retailers)
      .where(eq(retailers.id, input.retailerId))
      .for("no key update");
    if (!retailer) return { ok: false, error: "Retailer not found." };
    await postEntry(tx, plan.entry, session.user.id, plan.note);
    return { ok: true };
  });
  if (res.ok) {
    revalidatePath("/ledger");
    revalidatePath(`/ledger/${input.retailerId}`);
    revalidatePath("/approvals");
    revalidatePath("/dashboard");
  }
  return res;
}
