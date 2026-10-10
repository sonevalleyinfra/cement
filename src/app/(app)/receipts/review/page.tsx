import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { receipts, retailers } from "@/db/schema";
import { formatDate } from "@/lib/datetime";
import { can, rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { ReviewView } from "./review-view";

export default async function ReviewPage() {
  const { user } = await requireRole(...rolesFor("verifyPayments"));
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
      createdAt: receipts.createdAt,
    })
    .from(receipts)
    .innerJoin(retailers, eq(retailers.id, receipts.retailerId))
    .where(inArray(receipts.status, ["unverified", "pending"]))
    .orderBy(asc(receipts.createdAt));
  return (
    <ReviewView
      canReverse={can(user.role, "reverseReceipt")}
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
        date: formatDate(r.createdAt),
      }))}
    />
  );
}
