import { and, asc, eq, isNotNull } from "drizzle-orm";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { db } from "@/db";
import { orders, products, retailers } from "@/db/schema";
import { getCreditExposures } from "@/lib/credit-check";
import { getRateHints } from "@/lib/order-hints";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { ApprovalCard } from "./approval-card";

export default async function ApprovalsPage() {
  await requireRole(...rolesFor("viewApprovals"));
  const rows = await db
    .select({
      id: orders.id,
      retailerId: orders.retailerId,
      productId: orders.productId,
      bags: orders.bags,
      ratePaise: orders.ratePaise,
      // Staff only: this page is for accounts and admin.
      staffNote: orders.staffNote,
      retailer: retailers.name,
      product: products.name,
    })
    .from(orders)
    .innerJoin(retailers, eq(orders.retailerId, retailers.id))
    .innerJoin(products, eq(orders.productId, products.id))
    // Waiting for accounts: placed, with the rate filled (see isWaitingApproval in rate-rules).
    .where(and(eq(orders.status, "placed"), isNotNull(orders.ratePaise)))
    .orderBy(asc(orders.createdAt))
    .limit(100);

  // The shop's last rate and this week's range, so a rate far from usual stands out (staff only).
  const [hints, credit] = await Promise.all([
    Promise.all(rows.map((r) => getRateHints({ retailerId: r.retailerId, productId: r.productId, excludeOrderId: r.id }))),
    // The credit check per card (fails closed: null = "Couldn't check dues"). Approving checks again.
    getCreditExposures(rows.map((r) => ({ id: r.id, retailerId: r.retailerId, bags: r.bags, ratePaise: r.ratePaise ?? 0 }))),
  ]);
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
                  staffNote: r.staffNote,
                }}
                credit={credit?.get(r.id) ?? null}
                hint={hints[i]}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
