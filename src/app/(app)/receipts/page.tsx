import { and, desc, eq, exists, inArray, sql, type SQL } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/app/empty-state";
import { ListCard } from "@/components/app/list-card";
import { StatusChip } from "@/components/app/status-chip";
import { db } from "@/db";
import { receiptAllocations, receipts, retailers } from "@/db/schema";
import { formatDateTime } from "@/lib/datetime";
import { getAccessibleFirms } from "@/lib/firm-access";
import { formatINR } from "@/lib/money";
import { isRetailerOnly } from "@/lib/order-access";
import { can } from "@/lib/permissions";
import { MODE_LABELS, receiptChip } from "@/lib/receipt-rules";
import { requireUser } from "@/lib/session";

/**
 * Which receipts to list, as a filter for the query: a pure retailer sees their own shop's;
 * staff see those with a line for one of their firms. Null = not allowed; "none" = nothing to show.
 */
async function receiptFilter(user: { id: string; role?: string | null }): Promise<SQL | "none" | null> {
  if (isRetailerOnly(user.role)) {
    const [own] = await db.select({ id: retailers.id }).from(retailers).where(eq(retailers.userId, user.id)).limit(1);
    return own ? eq(receipts.retailerId, own.id) : "none";
  }
  if (!can(user.role, "viewReceipts")) return null;
  const firmIds = (await getAccessibleFirms(user.id, user.role)).map((f) => f.id);
  if (firmIds.length === 0) return "none";
  return exists(
    db
      .select({ one: sql`1` })
      .from(receiptAllocations)
      .where(and(eq(receiptAllocations.receiptId, receipts.id), inArray(receiptAllocations.firmId, firmIds))),
  );
}

export default async function ReceiptsPage() {
  const { user } = await requireUser();
  const filter = await receiptFilter(user);
  if (filter === null) redirect("/dashboard");
  const staff = !isRetailerOnly(user.role);

  // Newest 100 only, picked in the database.
  const rows =
    filter === "none"
      ? []
      : await db
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
          .where(filter)
          .orderBy(desc(receipts.createdAt))
          .limit(100);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{staff ? "Receipts" : "Payments"}</h1>
        {staff && (
          <div className="flex gap-4">
            {can(user.role, "verifyPayments") && (
              <Link href="/receipts/review" className="text-sm font-semibold underline">
                Verify
              </Link>
            )}
            {can(user.role, "recordReceipt") && (
              <Link href="/receipts/new" className="text-sm font-semibold underline">
                New receipt
              </Link>
            )}
          </div>
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState title={staff ? "No receipts yet" : "No payments yet"} />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r, i) => {
            const chip = receiptChip(r.status);
            return (
              <li key={r.id}>
                <ListCard
                  index={i}
                  href={`/receipts/${r.id}`}
                  title={r.retailer}
                  top={
                    <>
                      <span className="inline-flex h-6 items-center rounded-full bg-muted px-2.5 text-xs font-medium">
                        {MODE_LABELS[r.mode] ?? r.mode}
                      </span>
                      <StatusChip status={chip.status} label={chip.label} />
                    </>
                  }
                  bottom={
                    <>
                      <span className="text-xs text-muted-foreground">
                        #{r.no} · {formatDateTime(r.createdAt)}
                      </span>
                      <span className="tabular text-lg font-bold">{formatINR(r.totalPaise, { hidePaise: true })}</span>
                    </>
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
