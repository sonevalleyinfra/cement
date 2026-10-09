import { and, asc, eq, inArray } from "drizzle-orm";
import { EmptyState } from "@/components/app/empty-state";
import { db } from "@/db";
import { receipts, retailers } from "@/db/schema";
import { formatDate } from "@/lib/datetime";
import { getAccessibleFirms } from "@/lib/firm-access";
import { requireRole } from "@/lib/session";
import { ReviewView } from "./review-view";

export default async function ReviewPage() {
  const { user } = await requireRole("accounts");
  const firms = await getAccessibleFirms(user.id, user.role);
  const firmIds = firms.map((f) => f.id);
  if (firmIds.length === 0) return <EmptyState title="No firm available" />;
  const rows = await db
    .select({
      id: receipts.id,
      no: receipts.receiptNo,
      retailer: retailers.name,
      mode: receipts.mode,
      status: receipts.status,
      totalPaise: receipts.totalPaise,
      utr: receipts.utr,
      chequeNumber: receipts.chequeNumber,
      chequeDate: receipts.chequeDate,
      bankName: receipts.bankName,
      receivedFirmId: receipts.receivedFirmId,
      createdAt: receipts.createdAt,
    })
    .from(receipts)
    .innerJoin(retailers, eq(retailers.id, receipts.retailerId))
    .where(
      and(
        inArray(receipts.receivedFirmId, firmIds),
        inArray(receipts.status, ["unverified", "pending"]),
      ),
    )
    .orderBy(asc(receipts.createdAt));
  const firmName = new Map(firms.map((f) => [f.id, f.name]));
  return (
    <ReviewView
      rows={rows.map((r) => ({
        id: r.id,
        no: r.no,
        retailer: r.retailer,
        mode: r.mode,
        totalPaise: r.totalPaise,
        utr: r.utr,
        chequeNumber: r.chequeNumber,
        chequeDate: r.chequeDate,
        bankName: r.bankName,
        firmName: firmName.get(r.receivedFirmId ?? "") ?? "",
        date: formatDate(r.createdAt),
      }))}
    />
  );
}
