import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { StatusChip } from "@/components/app/status-chip";
import { db } from "@/db";
import { dispatches, orderEvents, orders, products, retailers, user as users, vehicles } from "@/db/schema";
import { formatDateTime } from "@/lib/datetime";
import { formatINR } from "@/lib/money";
import { isUuid } from "@/lib/ids";
import { canCancelOrder, canSeePrice, chipLabel, chipStatus, historyForViewer, historyStepLabel } from "@/lib/order-access";
import { isCloseShort, isOrderStatus, orderValuePaise } from "@/lib/order-rules";
import { canFillRate } from "@/lib/rate-rules";
import { requireUser } from "@/lib/session";
import { CancelForm } from "./cancel-form";
import { RateForm } from "./rate-form";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireUser();
  if (!isUuid(id)) notFound();

  const [o] = await db
    .select({
      id: orders.id,
      retailerId: orders.retailerId,
      bags: orders.bags,
      ratePaise: orders.ratePaise,
      status: orders.status,
      notes: orders.notes,
      salesRepId: orders.salesRepId,
      placedBy: orders.placedBy,
      retailer: retailers.name,
      product: products.name,
    })
    .from(orders)
    .innerJoin(retailers, eq(orders.retailerId, retailers.id))
    .innerJoin(products, eq(orders.productId, products.id))
    .where(eq(orders.id, id))
    .limit(1);
  if (!o) notFound();

  // Staff see every order; a pure retailer only sees their own shop's orders.
  const showPrice = canSeePrice(user.role);
  if (!showPrice) {
    const [own] = await db
      .select({ id: retailers.id })
      .from(retailers)
      .where(eq(retailers.userId, user.id))
      .limit(1);
    if (own?.id !== o.retailerId) notFound();
  }

  const [allEvents, loads] = await Promise.all([
    db
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
      .orderBy(asc(orderEvents.createdAt)),
    // Truck loads: shown to everyone who may see the order (spec 4.6); the rate to staff only.
    db
      .select({
        id: dispatches.id,
        bags: dispatches.bags,
        ratePaise: dispatches.ratePaise,
        driverName: dispatches.driverName,
        driverPhone: dispatches.driverPhone,
        createdAt: dispatches.createdAt,
        vehicle: vehicles.number,
      })
      .from(dispatches)
      .innerJoin(vehicles, eq(dispatches.vehicleId, vehicles.id))
      .where(eq(dispatches.orderId, o.id))
      .orderBy(asc(dispatches.createdAt)),
  ]);
  // A retailer never sees rate edits or staff reasons about money.
  const events = historyForViewer(user.role, allEvents);
  const sentBags = loads.reduce((n, l) => n + l.bags, 0);
  const valuePaise = orderValuePaise({ status: o.status, bags: o.bags, ratePaise: o.ratePaise, loads });

  const canCancel = showPrice && canCancelOrder(user.role, user.id, o);
  const canRate = canFillRate(user.role, user.id, o.salesRepId, o.status);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        {isOrderStatus(o.status) && <StatusChip status={chipStatus(o.status)} label={chipLabel(o.status)} />}
      </div>
      <div>
        <h1 className="text-xl font-bold">{o.retailer}</h1>
        <p className="text-sm text-muted-foreground">
          {o.product} · <span className="tabular">{o.bags}</span> bags
        </p>
        {o.notes && <p className="mt-1 text-sm">{o.notes}</p>}
      </div>
      {showPrice && o.ratePaise !== null && valuePaise !== null && (
        <div className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6">
          <div className="text-xs text-muted-foreground">
            Rate {formatINR(o.ratePaise)} per bag
          </div>
          <div className="tabular text-2xl font-bold">{formatINR(valuePaise)}</div>
        </div>
      )}
      {loads.length > 0 && (
        <ul className="flex flex-col gap-2">
          {loads.map((l) => (
            <li key={l.id} className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6">
              <div className="flex items-baseline justify-between gap-2">
                <span className="tabular text-lg font-bold">{l.bags} bags</span>
                <span className="text-sm font-semibold">{l.vehicle}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {l.driverName}
                {l.driverPhone && (
                  <>
                    {" · "}
                    <a href={`tel:${l.driverPhone}`} className="tabular underline">
                      {l.driverPhone}
                    </a>
                  </>
                )}
                {" · "}
                {formatDateTime(l.createdAt)}
              </div>
              {showPrice && l.ratePaise !== null && l.ratePaise !== o.ratePaise && (
                <div className="text-xs text-muted-foreground">Rate {formatINR(l.ratePaise)} per bag</div>
              )}
            </li>
          ))}
        </ul>
      )}
      {canRate && <RateForm orderId={o.id} bags={o.bags} />}
      {canCancel && <CancelForm orderId={o.id} closeShort={isCloseShort(o.status, sentBags)} />}
      <ol className="flex flex-col gap-3 border-l pl-4">
        {events.map((e) => (
          <li key={e.id}>
            <div className="text-sm font-semibold">{historyStepLabel(e)}</div>
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
