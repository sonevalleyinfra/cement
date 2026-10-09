import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { FirmChip } from "@/components/app/firm-chip";
import { StatusChip } from "@/components/app/status-chip";
import { db } from "@/db";
import { firms, orderEvents, orders, products, retailers, user as users } from "@/db/schema";
import { findAccessibleFirm } from "@/lib/firm-access";
import { formatDateTime } from "@/lib/datetime";
import { formatINR } from "@/lib/money";
import { canSeePrice, chipStatus } from "@/lib/order-access";
import { isOrderStatus, orderTotalPaise } from "@/lib/order-rules";
import { canFillRate } from "@/lib/rate-rules";
import { requireUser } from "@/lib/session";
import { RateForm } from "./rate-form";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireUser();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const [o] = await db
    .select({
      id: orders.id,
      firmId: orders.firmId,
      retailerId: orders.retailerId,
      bags: orders.bags,
      ratePaise: orders.ratePaise,
      status: orders.status,
      notes: orders.notes,
      salesRepId: orders.salesRepId,
      retailer: retailers.name,
      product: products.name,
      firmName: firms.name,
      firmSlot: firms.slot,
    })
    .from(orders)
    .innerJoin(retailers, eq(orders.retailerId, retailers.id))
    .innerJoin(products, eq(orders.productId, products.id))
    .innerJoin(firms, eq(orders.firmId, firms.id))
    .where(eq(orders.id, id))
    .limit(1);
  if (!o) notFound();

  // Staff need access to the firm; a pure retailer only sees their own shop's orders.
  const showPrice = canSeePrice(user.role);
  if (showPrice) {
    if (!(await findAccessibleFirm(user.id, user.role, o.firmId))) notFound();
  } else {
    const [own] = await db
      .select({ id: retailers.id })
      .from(retailers)
      .where(eq(retailers.userId, user.id))
      .limit(1);
    if (own?.id !== o.retailerId) notFound();
  }

  const events = await db
    .select({
      id: orderEvents.id,
      toStatus: orderEvents.toStatus,
      reason: orderEvents.reason,
      createdAt: orderEvents.createdAt,
      actor: users.name,
    })
    .from(orderEvents)
    .innerJoin(users, eq(orderEvents.actorId, users.id))
    .where(eq(orderEvents.orderId, o.id))
    .orderBy(asc(orderEvents.createdAt));

  const canRate = canFillRate(user.role, user.id, o.salesRepId, o.status);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <FirmChip name={o.firmName} slot={o.firmSlot} />
        {isOrderStatus(o.status) && <StatusChip status={chipStatus(o.status)} />}
      </div>
      <div>
        <h1 className="text-xl font-bold">{o.retailer}</h1>
        <p className="text-sm text-muted-foreground">
          {o.product} · <span className="tabular">{o.bags}</span> bags
        </p>
        {o.notes && <p className="mt-1 text-sm">{o.notes}</p>}
      </div>
      {showPrice && o.ratePaise !== null && (
        <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/8">
          <div className="text-xs text-muted-foreground">
            Rate {formatINR(o.ratePaise)} per bag
          </div>
          <div className="tabular text-2xl font-bold">
            {formatINR(orderTotalPaise(o.bags, o.ratePaise))}
          </div>
        </div>
      )}
      {canRate && <RateForm orderId={o.id} bags={o.bags} />}
      <ol className="flex flex-col gap-3 border-l pl-4">
        {events.map((e) => (
          <li key={e.id}>
            <div className="text-sm font-semibold capitalize">{e.toStatus.replace("_", " ")}</div>
            <div className="text-xs text-muted-foreground">
              {e.actor} · {formatDateTime(e.createdAt)}
            </div>
            {e.reason && <div className="text-sm">Reason: {e.reason}</div>}
          </li>
        ))}
      </ol>
    </div>
  );
}
