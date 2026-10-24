import { asc } from "drizzle-orm";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { db } from "@/db";
import { retailers } from "@/db/schema";
import { getAllBalances } from "@/lib/ledger";
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
  await requireRole(...rolesFor("recordReceipt"));
  // Switched-on shops, plus switched-off shops that still owe (their dues can still be collected).
  const [shops, balances] = await Promise.all([
    db
      .select({ id: retailers.id, name: retailers.name, place: retailers.place, active: retailers.active })
      .from(retailers)
      .orderBy(asc(retailers.name)),
    getAllBalances(),
  ]);
  const list = payableShops(shops, new Map(balances.map((b) => [b.retailerId, b.balancePaise]))).map(
    ({ id, name, place }) => ({ id, name, place }),
  );
  if (list.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="New payment" back="/receipts" />
        <EmptyState title="No retailers yet" />
      </div>
    );
  }
  return <ReceiptForm retailers={list} initialRetailerId={pickPrefillRetailerId((await searchParams).retailer, list)} />;
}
