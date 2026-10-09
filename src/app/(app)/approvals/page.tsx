import { and, asc, eq, inArray } from "drizzle-orm";
import { EmptyState } from "@/components/app/empty-state";
import { FirmChip } from "@/components/app/firm-chip";
import { db } from "@/db";
import { firms, orders, products, retailers } from "@/db/schema";
import { getAccessibleFirms } from "@/lib/firm-access";
import { getDues } from "@/lib/dues";
import { requireRole } from "@/lib/session";
import { ApprovalCard } from "./approval-card";

export default async function ApprovalsPage() {
  const { user } = await requireRole("accounts");
  const firmIds = (await getAccessibleFirms(user.id, user.role)).map((f) => f.id);
  const rows =
    firmIds.length === 0
      ? []
      : await db
          .select({
            id: orders.id,
            firmId: orders.firmId,
            retailerId: orders.retailerId,
            bags: orders.bags,
            ratePaise: orders.ratePaise,
            retailer: retailers.name,
            product: products.name,
            firmName: firms.name,
            firmSlot: firms.slot,
          })
          .from(orders)
          .innerJoin(retailers, eq(orders.retailerId, retailers.id))
          .innerJoin(products, eq(orders.productId, products.id))
          .innerJoin(firms, eq(orders.firmId, firms.id))
          .where(and(eq(orders.status, "rate_filled"), inArray(orders.firmId, firmIds)))
          .orderBy(asc(orders.createdAt))
          .limit(100);

  if (rows.length === 0) return <EmptyState title="Nothing waiting for approval" />;

  const cards = await Promise.all(
    rows.map(async (r) => ({ r, dues: await getDues(r.retailerId, r.firmId) })),
  );
  return (
    <ul className="flex flex-col gap-3">
      {cards.map(({ r, dues }, i) => (
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
            dues={dues}
            chip={<FirmChip name={r.firmName} slot={r.firmSlot} />}
          />
        </li>
      ))}
    </ul>
  );
}
