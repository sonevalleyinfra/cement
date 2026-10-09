import { desc, eq, and, inArray } from "drizzle-orm";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { FirmChip } from "@/components/app/firm-chip";
import { getFirmSelection } from "@/components/app/firm-switcher";
import { ListCard } from "@/components/app/list-card";
import { PinnedAction } from "@/components/app/pinned-action";
import { StatusChip } from "@/components/app/status-chip";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { dispatches, firms, orders, products, retailers } from "@/db/schema";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/datetime";
import { canPlaceOrder, canSeePrice, chipLabel, chipStatus, orderListScope } from "@/lib/order-access";
import { isOrderStatus, orderValuePaise } from "@/lib/order-rules";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export default async function OrdersPage() {
  const { user } = await requireUser();
  const { firms: myFirms, selection } = await getFirmSelection();
  const showPrice = canSeePrice(user.role);

  const [own] = await db
    .select({ id: retailers.id })
    .from(retailers)
    .where(eq(retailers.userId, user.id))
    .limit(1);
  const scope = orderListScope(user.role, own?.id ?? null);

  const allowedIds = myFirms.map((f) => f.id);
  const conditions = [];
  if (selection.mode === "firm") conditions.push(eq(orders.firmId, selection.firmId));
  if (scope.kind === "retailer") conditions.push(eq(orders.retailerId, scope.retailerId));

  const rows =
    selection.mode === "none" || scope.kind === "none" || (selection.mode === "all" && allowedIds.length === 0)
      ? []
      : await db
          .select({
            id: orders.id,
            bags: orders.bags,
            ratePaise: orders.ratePaise,
            status: orders.status,
            createdAt: orders.createdAt,
            retailer: retailers.name,
            product: products.name,
            firmName: firms.name,
            firmSlot: firms.slot,
          })
          .from(orders)
          .innerJoin(retailers, eq(orders.retailerId, retailers.id))
          .innerJoin(products, eq(orders.productId, products.id))
          .innerJoin(firms, eq(orders.firmId, firms.id))
          .where(conditions.length ? and(...conditions) : undefined)
          .orderBy(desc(orders.createdAt))
          .limit(100);

  // Truck loads, so the amount counts each load at its own rate (staff only).
  const loads =
    showPrice && rows.length > 0
      ? await db
          .select({ orderId: dispatches.orderId, bags: dispatches.bags, ratePaise: dispatches.ratePaise })
          .from(dispatches)
          .where(inArray(dispatches.orderId, rows.map((r) => r.id)))
      : [];
  const valueOf = (o: (typeof rows)[number]) =>
    orderValuePaise({ ...o, loads: loads.filter((l) => l.orderId === o.id) });

  const canPlace = canPlaceOrder(user.role) && !selection.readOnly;

  return (
    <>
      {selection.mode === "none" ? (
        <EmptyState title="No firm assigned to you. Ask admin." />
      ) : rows.length === 0 ? (
        <EmptyState title="No orders" />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((o, i) => (
            <li key={o.id}>
              <ListCard
                index={i}
                href={`/orders/${o.id}`}
                title={o.retailer}
                top={
                  <>
                    <FirmChip name={o.firmName} slot={o.firmSlot} />
                    {isOrderStatus(o.status) && <StatusChip status={chipStatus(o.status)} label={chipLabel(o.status)} />}
                  </>
                }
                bottom={
                  <>
                    <div>
                      <div className="tabular text-2xl font-bold">{o.bags} bags</div>
                      <div className="text-xs text-muted-foreground">
                        {o.product} · {formatDate(o.createdAt)}
                      </div>
                    </div>
                    {showPrice && valueOf(o) !== null && (
                      <div className="tabular text-lg font-semibold">{formatINR(valueOf(o) ?? 0)}</div>
                    )}
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}
      {canPlace && (
        <PinnedAction>
          <Link href="/orders/new" className={cn(buttonVariants(), "w-full")}>
            New order
          </Link>
        </PinnedAction>
      )}
    </>
  );
}
