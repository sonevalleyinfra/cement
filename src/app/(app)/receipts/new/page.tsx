import { asc, eq } from "drizzle-orm";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { db } from "@/db";
import { bankAccounts, retailers } from "@/db/schema";
import { bankAccountLabel } from "@/lib/bank-account-rules";
import { toISTDateKey } from "@/lib/datetime";
import { isAdmin } from "@/lib/roles";
import { pickPrefillRetailerId } from "@/lib/retailer-rules";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { ReceiptForm } from "./receipt-form";

export default async function NewReceiptPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireRole(...rolesFor("recordReceipt"));
  const [list, accounts] = await Promise.all([
    db
      .select({ id: retailers.id, name: retailers.name, place: retailers.place })
      .from(retailers)
      .where(eq(retailers.active, true))
      .orderBy(asc(retailers.name)),
    // Switched-on accounts only: an online payment picks the one it came into.
    db
      .select({ id: bankAccounts.id, name: bankAccounts.name, last4: bankAccounts.last4 })
      .from(bankAccounts)
      .where(eq(bankAccounts.active, true))
      .orderBy(asc(bankAccounts.name)),
  ]);
  if (list.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="New payment" back="/receipts" />
        <EmptyState title="No retailers yet" />
      </div>
    );
  }
  return (
    <ReceiptForm
      retailers={list}
      initialRetailerId={pickPrefillRetailerId((await searchParams).retailer, list)}
      accounts={accounts.map((a) => ({ id: a.id, label: bankAccountLabel(a) }))}
      admin={isAdmin(session.user.role)}
      today={toISTDateKey(new Date())}
    />
  );
}
