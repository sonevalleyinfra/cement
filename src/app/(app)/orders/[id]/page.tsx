import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { StatusChip } from "@/components/app/status-chip";
import { db } from "@/db";
import { dispatches, orderEvents, orders, products, retailers, user as users, vehicles } from "@/db/schema";
import { formatDateTime } from "@/lib/datetime";
import { formatINR } from "@/lib/money";
import { isUuid } from "@/lib/ids";
import {
  canSeePrice,
  cancelledNote,
  historyForViewer,
  historyRateLine,
  historyReason,
  historyStepLabel,
  orderAmountSummary,
} from "@/lib/order-access";
import { canCancelOrder, isOrderStatus, remainingBags } from "@/lib/order-rules";
import { canChangeRate, canFillRate } from "@/lib/rate-rules";
import { requireUser } from "@/lib/session";
import { bagsText } from "@/lib/words";
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

  // Staff see every order; anyone else (a retailer) only their own shop's orders.
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
        fromRatePaise: orderEvents.fromRatePaise,
        toRatePaise: orderEvents.toRatePaise,
        createdAt: orderEvents.createdAt,
        actor: users.name,
      })
      .from(orderEvents)
      .innerJoin(users, eq(orderEvents.actorId, users.id))
      .where(eq(orderEvents.orderId, o.id))
      .orderBy(asc(orderEvents.createdAt)),
    // Truck loads: shown to everyone who may see the order; the rate to staff only.
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
  // A retailer never sees rate rows or staff reasons about money; staff see old → new rate.
  const events = historyForViewer(user.role, allEvents);
  const sentBags = loads.reduce((n, l) => n + l.bags, 0);
  const notSent = remainingBags(o.bags, sentBags);
  // Staff only. Never one rate that was not billed: see orderAmountSummary.
  const amount = showPrice ? orderAmountSummary({ status: o.status, bags: o.bags, ratePaise: o.ratePaise, loads }) : null;
  const cancelled = cancelledNote(o.status, o.bags, sentBags);

  const canCancel = canCancelOrder(user.role, o.status);
  const rateMode = canFillRate(user.role, user.id, o) ? "fill" : canChangeRate(user.role, o) ? "change" : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={o.retailer} back="/orders" action={isOrderStatus(o.status) && <StatusChip status={o.status} />}>
        <p>
          {o.product} · <span className="tabular">{bagsText(o.bags)}</span>
        </p>
        {cancelled && <p>{cancelled}</p>}
      </PageHeader>
      {o.notes && <p className="text-sm">{o.notes}</p>}
      {amount && (
        <div className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6">
          <div className="text-xs text-muted-foreground">{amount.caption}</div>
          <div className="tabular text-2xl font-bold">{formatINR(amount.totalPaise)}</div>
          {amount.lines.map((line) => (
            <div key={line} className="tabular text-xs text-muted-foreground">
              {line}
            </div>
          ))}
        </div>
      )}
      {loads.length > 0 && (
        <ul className="flex flex-col gap-2">
          {loads.map((l) => (
            <li key={l.id} className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6">
              <div className="flex items-baseline justify-between gap-2">
                <span className="tabular text-lg font-bold">{bagsText(l.bags)}</span>
                <span className="text-sm font-semibold">{l.vehicle}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{l.driverName}</span>
                {l.driverPhone && (
                  <a
                    href={`tel:${l.driverPhone}`}
                    className="tabular -my-1 -mr-2 inline-flex min-h-12 min-w-12 items-center justify-end px-2 text-sm font-semibold text-foreground underline underline-offset-2"
                  >
                    {l.driverPhone}
                  </a>
                )}
              </div>
              <div className="text-xs text-muted-foreground">{formatDateTime(l.createdAt)}</div>
              {showPrice && (
                <div className="text-xs text-muted-foreground">
                  {formatINR(l.ratePaise)} per bag · {formatINR(l.bags * l.ratePaise)}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {rateMode && <RateForm orderId={o.id} bags={notSent} mode={rateMode} hasRate={o.ratePaise !== null} />}
      {canCancel && <CancelForm orderId={o.id} notSent={notSent} sent={sentBags} />}
      <ol className="flex flex-col gap-3 border-l pl-4">
        {events.map((e) => (
          <li key={e.id}>
            <div className="text-sm font-semibold">{historyStepLabel(e)}</div>
            <div className="text-xs text-muted-foreground">
              {e.actor} · {formatDateTime(e.createdAt)}
            </div>
            {historyRateLine(user.role, e) && (
              <div className="tabular text-sm font-semibold">{historyRateLine(user.role, e)}</div>
            )}
            {historyReason(e.reason) && <div className="text-sm">{historyReason(e.reason)}</div>}
          </li>
        ))}
      </ol>
    </div>
  );
}
