import { asc, eq } from "drizzle-orm";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { db } from "@/db";
import { retailers } from "@/db/schema";
import { pickPrefillRetailerId } from "@/lib/retailer-rules";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { ReceiptForm } from "./receipt-form";

export default async function NewReceiptPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole(...rolesFor("recordReceipt"));
  const list = await db
    .select({ id: retailers.id, name: retailers.name, place: retailers.place })
    .from(retailers)
    .where(eq(retailers.active, true))
    .orderBy(asc(retailers.name));
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
