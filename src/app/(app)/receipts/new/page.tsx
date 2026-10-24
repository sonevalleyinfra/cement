import { asc, eq } from "drizzle-orm";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { db } from "@/db";
import { bankAccounts, retailers } from "@/db/schema";
import { bankAccountLabel } from "@/lib/bank-account-rules";
import { toISTDateKey } from "@/lib/datetime";
import { getAllBalances } from "@/lib/ledger";
import { isAdmin } from "@/lib/roles";
import { pickPrefillRetailerId } from "@/lib/retailer-rules";
import { payableShops } from "@/lib/shop-off-rules";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { ReceiptForm } from "./receipt-form";

export default async function NewReceiptPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireRole(...rolesFor("recordReceipt"));
  // Switched-on shops, plus switched-off shops that still owe (their dues can still be collected).
  const [shops, balances, accounts] = await Promise.all([
    db
      .select({ id: retailers.id, name: retailers.name, place: retailers.place, active: retailers.active })
      .from(retailers)
      .orderBy(asc(retailers.name)),
    getAllBalances(),
    // Switched-on accounts only: an online payment picks the one it came into.
    db
      .select({ id: bankAccounts.id, name: bankAccounts.name, last4: bankAccounts.last4 })
      .from(bankAccounts)
      .where(eq(bankAccounts.active, true))
      .orderBy(asc(bankAccounts.name)),
  ]);
  const list = payableShops(shops, new Map(balances.map((b) => [b.retailerId, b.balancePaise]))).map(
    ({ id, name, place, active }) => ({ id, name, place, active }),
  );
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
