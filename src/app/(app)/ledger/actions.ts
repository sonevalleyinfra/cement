"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { ledgerEntries, retailers } from "@/db/schema";
import { postEntry } from "@/lib/ledger";
import { openingEntry } from "@/lib/ledger-rules";
import { requireFirm, requireRole } from "@/lib/session";

export type LedgerResult = { ok: true } | { ok: false; error: string };

/** Admin sets the opening balance for one retailer with one firm (once). `owes` false = advance. */
export async function setOpeningBalance(input: {
  retailerId: string;
  firmId: string;
  rupeeDigits: string;
  owes: boolean;
}): Promise<LedgerResult> {
  const session = await requireRole("admin");
  await requireFirm(input.firmId);
  if (!/^\d{1,9}$/.test(input.rupeeDigits)) return { ok: false, error: "Enter the amount." };
  const paise = Number(input.rupeeDigits) * 100;
  const signed = input.owes ? paise : -paise;

  const [retailer] = await db.select({ id: retailers.id }).from(retailers).where(eq(retailers.id, input.retailerId)).limit(1);
  if (!retailer) return { ok: false, error: "Retailer not found." };

  const res = await db.transaction(async (tx): Promise<LedgerResult> => {
    const existing = await tx
      .select({ kind: ledgerEntries.kind, firmId: ledgerEntries.firmId, retailerId: ledgerEntries.retailerId })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.retailerId, input.retailerId),
          eq(ledgerEntries.firmId, input.firmId),
          eq(ledgerEntries.kind, "opening"),
        ),
      );
    const entry = openingEntry(existing, input.retailerId, input.firmId, signed);
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
