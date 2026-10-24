"use server";

import { count, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { bankAccounts, receipts } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { changedFields } from "@/lib/audit-rules";
import { BANK_ACCOUNT_IN_USE, BANK_ACCOUNT_TAKEN, checkBankAccount } from "@/lib/bank-account-rules";
import { isDuplicateName } from "@/lib/catalogue-rules";
import { isForeignKeyViolation, isUniqueViolation } from "@/lib/db-errors";
import { isUuid } from "@/lib/ids";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";

export type BankAccountResult = { ok: true } | { ok: false; error: string };

const NOT_FOUND: BankAccountResult = { ok: false, error: "Account not found." };

function done(): BankAccountResult {
  revalidatePath("/bank-accounts");
  revalidatePath("/receipts/new");
  revalidatePath("/receipts/review");
  return { ok: true };
}

/** Adds an account (id null) or edits its name, last 4 digits and UPI ID. Admin only. */
export async function saveBankAccount(
  id: string | null,
  form: { name: string; last4: string; upiId: string },
): Promise<BankAccountResult> {
  const session = await requireRole(...rolesFor("manageBankAccounts"));
  if (id !== null && !isUuid(id)) return NOT_FOUND;
  const check = checkBankAccount({ name: form?.name, last4: form?.last4, upiId: form?.upiId });
  if (!check.ok) return check;
  const value = check.value;
  const actorId = session.user.id;
  try {
    const res = await db.transaction(async (tx): Promise<BankAccountResult> => {
      // One add or rename at a time, so two admins cannot make the same name.
      await tx.execute(sql`lock table ${bankAccounts} in share row exclusive mode`);
      const others = await tx
        .select({ name: bankAccounts.name })
        .from(bankAccounts)
        .where(id ? ne(bankAccounts.id, id) : undefined);
      if (isDuplicateName(value.name, others.map((o) => o.name))) return { ok: false, error: BANK_ACCOUNT_TAKEN };
      if (id) {
        const [before] = await tx.select().from(bankAccounts).where(eq(bankAccounts.id, id)).limit(1);
        if (!before) return NOT_FOUND;
        await tx.update(bankAccounts).set({ ...value, updatedAt: new Date() }).where(eq(bankAccounts.id, id));
        const diff = changedFields(before, value);
        if (diff) await writeAudit(tx, { actorId, entity: "bank_account", entityId: id, action: "edit", details: diff });
      } else {
        const [row] = await tx
          .insert(bankAccounts)
          .values({ ...value, createdBy: actorId })
          .returning({ id: bankAccounts.id });
        await writeAudit(tx, { actorId, entity: "bank_account", entityId: row.id, action: "add", details: { ...value } });
      }
      return { ok: true };
    });
    return res.ok ? done() : res;
  } catch (error) {
    if (isUniqueViolation(error, "bank_accounts_name_lower_unique")) return { ok: false, error: BANK_ACCOUNT_TAKEN };
    throw error;
  }
}

/** Switches an account off (it cannot be picked for a new payment) or back on. Old payments keep it. */
export async function setBankAccountActive(id: string, active: boolean): Promise<BankAccountResult> {
  const session = await requireRole(...rolesFor("manageBankAccounts"));
  if (!isUuid(id)) return NOT_FOUND;
  const res = await db.transaction(async (tx): Promise<BankAccountResult> => {
    // For update: waits for a payment being saved into this account (it holds a key share lock).
    const [row] = await tx.select().from(bankAccounts).where(eq(bankAccounts.id, id)).for("update");
    if (!row) return NOT_FOUND;
    if (row.active === active) return { ok: true };
    await tx.update(bankAccounts).set({ active, updatedAt: new Date() }).where(eq(bankAccounts.id, id));
    await writeAudit(tx, {
      actorId: session.user.id,
      entity: "bank_account",
      entityId: id,
      action: active ? "switch_on" : "switch_off",
      details: { name: row.name },
    });
    return { ok: true };
  });
  return res.ok ? done() : res;
}

/** Deletes an account that no payment uses (a used one is switched off instead). */
export async function deleteBankAccount(id: string): Promise<BankAccountResult> {
  const session = await requireRole(...rolesFor("manageBankAccounts"));
  if (!isUuid(id)) return NOT_FOUND;
  try {
    const res = await db.transaction(async (tx): Promise<BankAccountResult> => {
      const [row] = await tx.select().from(bankAccounts).where(eq(bankAccounts.id, id)).for("update");
      if (!row) return NOT_FOUND;
      const [used] = await tx.select({ c: count() }).from(receipts).where(eq(receipts.bankAccountId, id));
      if ((used?.c ?? 0) > 0) return { ok: false, error: BANK_ACCOUNT_IN_USE };
      await tx.delete(bankAccounts).where(eq(bankAccounts.id, id));
      await writeAudit(tx, {
        actorId: session.user.id,
        entity: "bank_account",
        entityId: id,
        action: "delete",
        details: { name: row.name, last4: row.last4, upiId: row.upiId },
      });
      return { ok: true };
    });
    return res.ok ? done() : res;
  } catch (error) {
    // A payment saved into it at the same moment: the foreign key stops the delete.
    if (isForeignKeyViolation(error)) return { ok: false, error: BANK_ACCOUNT_IN_USE };
    throw error;
  }
}
