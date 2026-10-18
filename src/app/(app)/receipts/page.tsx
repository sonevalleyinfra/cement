import { desc, eq, type SQL } from "drizzle-orm";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/app/empty-state";
import { ListCard } from "@/components/app/list-card";
import { PageHeader } from "@/components/app/page-header";
import { StatusChip } from "@/components/app/status-chip";
import { TextLink } from "@/components/app/text-link";
import { db } from "@/db";
import { receipts, retailers } from "@/db/schema";
import { formatDateTime } from "@/lib/datetime";
import { formatINR } from "@/lib/money";
import { isRetailerOnly } from "@/lib/order-access";
import { can, isStaff } from "@/lib/permissions";
import { MODE_LABELS, receiptChip } from "@/lib/receipt-rules";
import { requireUser } from "@/lib/session";

/**
 * Which payments to list: a pure retailer sees their own shop's; staff see all of them.
 * Null = not allowed; "none" = nothing to show; `where` empty = every receipt.
 */
async function receiptFilter(user: { id: string; role?: string | null }): Promise<{ where?: SQL } | "none" | null> {
  if (isRetailerOnly(user.role)) {
    const [own] = await db.select({ id: retailers.id }).from(retailers).where(eq(retailers.userId, user.id)).limit(1);
    return own ? { where: eq(receipts.retailerId, own.id) } : "none";
  }
  if (!can(user.role, "viewReceipts")) return null;
  return {};
}

export default async function ReceiptsPage() {
  const { user } = await requireUser();
  const filter = await receiptFilter(user);
  if (filter === null) redirect("/dashboard");
  const staff = isStaff(user.role);

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
          .where(filter.where)
          .orderBy(desc(receipts.createdAt))
          .limit(100);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Payments"
        action={
          staff && (
            <>
              {can(user.role, "verifyPayments") && (
                <TextLink href="/receipts/review" strong>
                  Verify
                </TextLink>
              )}
              {can(user.role, "recordReceipt") && (
                <TextLink href="/receipts/new" strong>
                  New payment
                </TextLink>
              )}
            </>
          )
        }
      />
      {rows.length === 0 ? (
        <EmptyState title="No payments yet" />
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
