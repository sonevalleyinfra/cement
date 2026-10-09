import { desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { ListCard } from "@/components/app/list-card";
import { db } from "@/db";
import { receiptAllocations, receipts, retailers } from "@/db/schema";
import { formatDateTime } from "@/lib/datetime";
import { getAccessibleFirms } from "@/lib/firm-access";
import { formatINR } from "@/lib/money";
import { can, rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";

const modeLabel: Record<string, string> = { cash: "Cash", online: "Online", cheque: "Cheque" };
const statusLabel: Record<string, string> = {
  received: "Received",
  unverified: "Online, unverified",
  verified: "Online, verified",
  pending: "Cheque pending",
  cleared: "Cleared",
  bounced: "Bounced",
};

export default async function ReceiptsPage() {
  const { user } = await requireRole(...rolesFor("viewReceipts"));
  const firms = await getAccessibleFirms(user.id, user.role);
  const firmIds = firms.map((f) => f.id);

  // Only receipts that touch a firm this user works on.
  const mine = firmIds.length
    ? await db.selectDistinct({ id: receiptAllocations.receiptId }).from(receiptAllocations).where(inArray(receiptAllocations.firmId, firmIds))
    : [];
  const rows = mine.length
    ? await db
        .select({
          id: receipts.id,
          no: receipts.receiptNo,
          retailer: retailers.name,
          mode: receipts.mode,
          status: receipts.status,
          totalPaise: receipts.totalPaise,
          createdAt: receipts.createdAt,
        })
        .from(receipts)
        .innerJoin(retailers, eq(retailers.id, receipts.retailerId))
        .where(inArray(receipts.id, mine.map((m) => m.id)))
        .orderBy(desc(receipts.createdAt))
        .limit(100)
    : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Receipts</h1>
        <div className="flex gap-4">
          {can(user.role, "verifyPayments") && (
            <Link href="/receipts/review" className="text-sm font-semibold underline">
              Verify
            </Link>
          )}
          <Link href="/receipts/new" className="text-sm font-semibold underline">
            New receipt
          </Link>
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No receipts yet" />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r, i) => (
            <li key={r.id}>
              <ListCard
                index={i}
                title={r.retailer}
                top={
                  <>
                    <span className="inline-flex h-6 items-center rounded-full bg-muted px-2.5 text-xs font-medium">
                      {modeLabel[r.mode] ?? r.mode}
                    </span>
                    <span className="text-xs font-medium text-muted-foreground">{statusLabel[r.status] ?? r.status}</span>
                  </>
                }
                bottom={
                  <>
                    <span className="text-xs text-muted-foreground">
                      #{r.no} · {formatDateTime(r.createdAt)}
                    </span>
                    <span className="tabular text-lg font-bold">{formatINR(r.totalPaise)}</span>
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
