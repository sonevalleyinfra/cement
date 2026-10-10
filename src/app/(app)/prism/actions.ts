"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { prismLedgerEntries } from "@/db/schema";
import { toISTDateKey } from "@/lib/datetime";
import { isUniqueViolation } from "@/lib/db-errors";
import { rolesFor } from "@/lib/permissions";
import { postPrismEntry } from "@/lib/prism";
import {
  adjustmentEntry,
  checkEntryDate,
  creditEntry,
  openingEntry,
  paymentEntry,
  type PrismResult,
} from "@/lib/prism-rules";
import { requireRole } from "@/lib/session";

export type PrismActionResult = { ok: true } | { ok: false; error: string };

/** Admin only. Returns who is acting and the entry date (empty = today in India). */
async function prepare(entryDate: unknown) {
  const session = await requireRole(...rolesFor("managePrism"));
  const today = toISTDateKey(new Date());
  const date = checkEntryDate(typeof entryDate === "string" && entryDate.trim() ? entryDate : today, today);
  return { session, date };
}

/** Saves the entry the rules built (and its activity-log line), then refreshes the screens. */
async function save(
  actorId: string,
  build: (existing: { kind: string }[], date: string) => PrismResult,
  date: string,
): Promise<PrismActionResult> {
  try {
    const res = await db.transaction(async (tx): Promise<PrismActionResult> => {
      const existing = await tx
        .select({ kind: prismLedgerEntries.kind })
        .from(prismLedgerEntries)
        .where(eq(prismLedgerEntries.kind, "opening"));
      const plan = build(existing, date);
      if (!plan.ok) return plan;
      await postPrismEntry(tx, plan.entry, actorId);
      return { ok: true };
    });
    if (res.ok) {
      revalidatePath("/prism");
      revalidatePath("/dashboard");
    }
    return res;
  } catch (e) {
    // Two taps at once: the database allows only one opening balance.
    if (isUniqueViolation(e, "prism_ledger_entries_one_opening_idx")) {
      return { ok: false, error: "Opening balance is already set." };
    }
    throw e;
  }
}

/** Opening balance, once. `weOwe` false means Prism owes us. */
export async function setPrismOpening(input: {
  amountPaise: number;
  weOwe: boolean;
  entryDate?: string;
}): Promise<PrismActionResult> {
  const { session, date } = await prepare(input?.entryDate);
  if (!date.ok) return date;
  const amount = Number(input.amountPaise);
  return save(session.user.id, (existing, d) => openingEntry(existing, input.weOwe ? amount : -amount, d), date.date);
}

/** A payment to Prism: amount, mode (bank / cash / other) and a reference. */
export async function recordPrismPayment(input: {
  amountPaise: number;
  mode: string;
  reference: string;
  entryDate?: string;
}): Promise<PrismActionResult> {
  const { session, date } = await prepare(input?.entryDate);
  if (!date.ok) return date;
  return save(
    session.user.id,
    (_, d) => paymentEntry(Number(input.amountPaise), input.mode, input.reference, d),
    date.date,
  );
}

/** A scheme / discount credit from Prism. A reason is required. */
export async function recordPrismCredit(input: {
  amountPaise: number;
  reason: string;
  entryDate?: string;
}): Promise<PrismActionResult> {
  const { session, date } = await prepare(input?.entryDate);
  if (!date.ok) return date;
  return save(session.user.id, (_, d) => creditEntry(Number(input.amountPaise), input.reason, d), date.date);
}

/** A fix: `amountPaise` is signed (+ we owe more, - we owe less). A reason is required. */
export async function addPrismAdjustment(input: {
  amountPaise: number;
  reason: string;
  entryDate?: string;
}): Promise<PrismActionResult> {
  const { session, date } = await prepare(input?.entryDate);
  if (!date.ok) return date;
  return save(session.user.id, (_, d) => adjustmentEntry(Number(input.amountPaise), input.reason, d), date.date);
}
