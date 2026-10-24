import { asc, count, desc, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts, receipts } from "@/db/schema";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { BankAccountsView } from "./bank-accounts-view";

/** The firm's bank accounts that online payments come into. Admin only. */
export default async function BankAccountsPage() {
  await requireRole(...rolesFor("manageBankAccounts"));
  const [rows, uses] = await Promise.all([
    db
      .select({
        id: bankAccounts.id,
        name: bankAccounts.name,
        last4: bankAccounts.last4,
        upiId: bankAccounts.upiId,
        active: bankAccounts.active,
      })
      .from(bankAccounts)
      .orderBy(desc(bankAccounts.active), asc(bankAccounts.name)),
    // Payments into each account (a used account can only be switched off).
    db
      .select({ bankAccountId: receipts.bankAccountId, payments: count() })
      .from(receipts)
      .where(isNotNull(receipts.bankAccountId))
      .groupBy(receipts.bankAccountId),
  ]);
  const usedBy = (id: string) => uses.find((u) => u.bankAccountId === id)?.payments ?? 0;
  return <BankAccountsView rows={rows.map((r) => ({ ...r, payments: usedBy(r.id) }))} />;
}
