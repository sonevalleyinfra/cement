import { and, asc, eq, isNotNull } from "drizzle-orm";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { db } from "@/db";
import { orders, products, retailers } from "@/db/schema";
import { getAllBalances } from "@/lib/ledger";
import { duesFrom } from "@/lib/ledger-rules";
import { getRateHints } from "@/lib/order-hints";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { ApprovalCard } from "./approval-card";

export default async function ApprovalsPage() {
  await requireRole(...rolesFor("viewApprovals"));
  const [rows, balances] = await Promise.all([
    db
      .select({
        id: orders.id,
        retailerId: orders.retailerId,
        productId: orders.productId,
        bags: orders.bags,
        ratePaise: orders.ratePaise,
        retailer: retailers.name,
        product: products.name,
      })
      .from(orders)
      .innerJoin(retailers, eq(orders.retailerId, retailers.id))
      .innerJoin(products, eq(orders.productId, products.id))
      // Waiting for accounts: placed, with the rate filled (see isWaitingApproval in rate-rules).
      .where(and(eq(orders.status, "placed"), isNotNull(orders.ratePaise)))
      .orderBy(asc(orders.createdAt))
      .limit(100),
    getAllBalances(),
  ]);

  // The shop's last rate and this week's range, so a rate far from usual stands out (staff only).
  const hints = await Promise.all(
    rows.map((r) => getRateHints({ retailerId: r.retailerId, productId: r.productId, excludeOrderId: r.id })),
  );
  const balanceOf = new Map(balances.map((b) => [b.retailerId, b.balancePaise]));
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Approvals" />
      {rows.length === 0 ? (
        <EmptyState title="Nothing waiting for approval" />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r, i) => (
            <li key={r.id}>
              <ApprovalCard
                index={i}
                order={{
                  id: r.id,
                  retailer: r.retailer,
                  product: r.product,
                  bags: r.bags,
                  ratePaise: r.ratePaise ?? 0,
                }}
                duesPaise={duesFrom(balanceOf.get(r.retailerId) ?? 0)}
                hint={hints[i]}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
