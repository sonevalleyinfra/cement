import { asc, eq } from "drizzle-orm";
import { EmptyState } from "@/components/app/empty-state";
import { db } from "@/db";
import { retailers } from "@/db/schema";
import { getAccessibleFirms } from "@/lib/firm-access";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { ReceiptForm } from "./receipt-form";

export default async function NewReceiptPage() {
  const { user } = await requireRole(...rolesFor("recordReceipt"));
  const firms = await getAccessibleFirms(user.id, user.role);
  if (firms.length === 0) return <EmptyState title="No firm available" />;
  const list = await db
    .select({ id: retailers.id, name: retailers.name, place: retailers.place })
    .from(retailers)
    .where(eq(retailers.active, true))
    .orderBy(asc(retailers.name));
  if (list.length === 0) return <EmptyState title="No retailers yet" />;
  return <ReceiptForm retailers={list} firms={firms.map((f) => ({ id: f.id, name: f.name, slot: f.slot }))} />;
}
