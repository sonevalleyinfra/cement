import { desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { ListCard } from "@/components/app/list-card";
import { PinnedAction } from "@/components/app/pinned-action";
import { StatusChip } from "@/components/app/status-chip";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { dispatches, orders, products, retailers } from "@/db/schema";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/datetime";
import { canPlaceOrder, canSeePrice, cancelledNote, orderListScope } from "@/lib/order-access";
import { isOrderStatus, orderValuePaise } from "@/lib/order-rules";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export default async function OrdersPage() {
  const { user } = await requireUser();
  const showPrice = canSeePrice(user.role);

  const [own] = await db
    .select({ id: retailers.id })
    .from(retailers)
    .where(eq(retailers.userId, user.id))
    .limit(1);
  const scope = orderListScope(user.role, own?.id ?? null);

  const rows =
    scope.kind === "none"
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
          })
          .from(orders)
          .innerJoin(retailers, eq(orders.retailerId, retailers.id))
          .innerJoin(products, eq(orders.productId, products.id))
          .where(scope.kind === "retailer" ? eq(orders.retailerId, scope.retailerId) : undefined)
          .orderBy(desc(orders.createdAt))
          .limit(100);

  // Truck loads: the amount counts each load at its own rate (staff only), and a cancelled
  // order shows how many bags went out.
  const loads =
    rows.length > 0
      ? await db
          .select({ orderId: dispatches.orderId, bags: dispatches.bags, ratePaise: dispatches.ratePaise })
          .from(dispatches)
          .where(inArray(dispatches.orderId, rows.map((r) => r.id)))
      : [];
  const loadsOf = (id: string) => loads.filter((l) => l.orderId === id);
  const valueOf = (o: (typeof rows)[number]) => orderValuePaise({ ...o, loads: loadsOf(o.id) });
  const sentOf = (id: string) => loadsOf(id).reduce((n, l) => n + l.bags, 0);

  const canPlace = canPlaceOrder(user.role);

  return (
    <>
      {rows.length === 0 ? (
        <EmptyState title="No orders" />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((o, i) => (
            <li key={o.id}>
              <ListCard
                index={i}
                href={`/orders/${o.id}`}
                title={o.retailer}
                top={isOrderStatus(o.status) && <StatusChip status={o.status} />}
                bottom={
                  <>
                    <div>
                      <div className="tabular text-2xl font-bold">{o.bags} bags</div>
                      <div className="text-xs text-muted-foreground">
                        {o.product} · {formatDate(o.createdAt)}
                      </div>
                      {cancelledNote(o.status, o.bags, sentOf(o.id)) && (
                        <div className="text-xs text-muted-foreground">{cancelledNote(o.status, o.bags, sentOf(o.id))}</div>
                      )}
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
