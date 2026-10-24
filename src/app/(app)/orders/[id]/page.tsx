import { and, asc, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/app/page-header";
import { ReverseSheet } from "@/components/app/reverse-sheet";
import { StatusChip } from "@/components/app/status-chip";
import { db } from "@/db";
import { dispatches, orderEvents, orders, products, retailers, user as users, vehicles } from "@/db/schema";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { formatINR } from "@/lib/money";
import { isUuid } from "@/lib/ids";
import { getRateHints, getStockAvailable } from "@/lib/order-hints";
import {
  canSeePrice,
  cancelledNote,
  historyForViewer,
  historyRateLine,
  historyReason,
  historyStepLabel,
  orderAmountSummary,
} from "@/lib/order-access";
import { DELIVER_TO_LABELS, notesForViewer, orderSourceLabel } from "@/lib/order-delivery-rules";
import { canCancelOrder, isOrderStatus, orderTotalPaise, remainingBags } from "@/lib/order-rules";
import { canChangeRate, canFillRate } from "@/lib/rate-rules";
import { reasonLabel } from "@/lib/reason-codes";
import { isReversibleOrderStatus, reversedByLoad } from "@/lib/reversal-rules";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { getPlaces } from "@/lib/stock-places";
import { placeKey } from "@/lib/stock-rules";
import { bagsText } from "@/lib/words";
import { CancelForm } from "./cancel-form";
import { RateForm } from "./rate-form";

/** One row of the facts block: a muted label on the left, the value on the right. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-baseline justify-between gap-4">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-base font-semibold break-words">{children}</span>
    </div>
  );
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireUser();
  if (!isUuid(id)) notFound();
  // Staff see prices, every order and the staff note. The staff note is not even selected for anyone else.
  const showPrice = canSeePrice(user.role);

  const columns = {
    id: orders.id,
    retailerId: orders.retailerId,
    productId: orders.productId,
    bags: orders.bags,
    ratePaise: orders.ratePaise,
    status: orders.status,
    deliverTo: orders.deliverTo,
    siteAddress: orders.siteAddress,
    receiverName: orders.receiverName,
    receiverPhone: orders.receiverPhone,
    requiredBy: orders.requiredBy,
    source: orders.source,
    shopNote: orders.shopNote,
    salesRepId: orders.salesRepId,
    placedBy: orders.placedBy,
    retailer: retailers.name,
    product: products.name,
  };
  const [o] = await db
    .select(showPrice ? { ...columns, staffNote: orders.staffNote } : columns)
    .from(orders)
    .innerJoin(retailers, eq(orders.retailerId, retailers.id))
    .innerJoin(products, eq(orders.productId, products.id))
    .where(eq(orders.id, id))
    .limit(1);
  if (!o) notFound();

  // Staff see every order; anyone else (a retailer) only their own shop's orders.
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
        reasonCode: orderEvents.reasonCode,
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
        reversesDispatchId: dispatches.reversesDispatchId,
        reasonCode: dispatches.reasonCode,
        fromGodownId: dispatches.fromGodownId,
        fromVehicleId: dispatches.fromVehicleId,
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
  const billedPaise = loads.reduce((n, l) => n + orderTotalPaise(l.bags, l.ratePaise), 0);
  // Staff only. Never one rate that was not billed: see orderAmountSummary.
  const amount = showPrice ? orderAmountSummary({ status: o.status, bags: o.bags, ratePaise: o.ratePaise, loads }) : null;
  const cancelled = cancelledNote(o.status, o.bags, sentBags);
  const notes = notesForViewer(user.role, { shopNote: o.shopNote, staffNote: "staffNote" in o ? o.staffNote : null });
  const site = o.deliverTo === "site";

  const canCancel = canCancelOrder(user.role, o.status);
  // Admin only (v2 B2): loads with bags left to reverse get a "Reverse" link; places are read only then.
  const reversed = reversedByLoad(loads);
  const leftOf = (l: (typeof loads)[number]) => (l.bags > 0 ? l.bags - (reversed.get(l.id) ?? 0) : 0);
  const canReverse = can(user.role, "reverseStock") && isReversibleOrderStatus(o.status) && loads.some((l) => leftOf(l) > 0);
  const backPlaces = canReverse ? await reversePlaces(loads) : [];
  const rateMode = canFillRate(user.role, user.id, o) ? "fill" : canChangeRate(user.role, o) ? "change" : null;
  // Staff only (never a retailer): last rate, this week's range and stock under the rate form.
  const [rateHint, stockBags] =
    rateMode && showPrice
      ? await Promise.all([
          getRateHints({ retailerId: o.retailerId, productId: o.productId, excludeOrderId: o.id }),
          getStockAvailable(o.productId),
        ])
      : [null, null];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={o.retailer} back="/orders" action={isOrderStatus(o.status) && <StatusChip status={o.status} />}>
        <p>
          {o.product} · <span className="tabular">{bagsText(o.bags)}</span>
        </p>
        {cancelled && <p>{cancelled}</p>}
      </PageHeader>
      <div className="flex flex-col gap-1 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6">
        <Fact label="Deliver to">
          {site ? `${DELIVER_TO_LABELS.site} · ${o.siteAddress ?? ""}` : DELIVER_TO_LABELS.shop}
        </Fact>
        {(o.receiverName || o.receiverPhone) && (
          <Fact label="Receiver">
            {o.receiverName}
            {o.receiverName && o.receiverPhone && " · "}
            {o.receiverPhone && (
              <a
                href={`tel:${o.receiverPhone}`}
                className="tabular -my-2 inline-flex min-h-12 items-center underline underline-offset-2"
              >
                {o.receiverPhone}
              </a>
            )}
          </Fact>
        )}
        {o.requiredBy && <Fact label="Needed by">{formatDate(o.requiredBy)}</Fact>}
        {showPrice && o.source && <Fact label="Source">{orderSourceLabel(o.source)}</Fact>}
        {notes.shopNote && <Fact label={showPrice ? "Note for shop" : "Note"}>{notes.shopNote}</Fact>}
        {notes.staffNote && <Fact label="Staff note">{notes.staffNote}</Fact>}
      </div>
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
          {loads.map((l) =>
            l.bags < 0 ? (
              <li key={l.id} className="flex items-baseline justify-between gap-2 rounded-2xl bg-muted px-4 py-3 text-sm">
                <span>
                  <span className="tabular font-semibold">−{bagsText(-l.bags)}</span> returned
                  {showPrice && l.reasonCode && l.reasonCode !== "returned" && ` · ${reasonLabel(l.reasonCode, "reversal")}`}
                </span>
                <span className="text-xs text-muted-foreground">{formatDateTime(l.createdAt)}</span>
              </li>
            ) : (
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
              {canReverse && leftOf(l) > 0 ? (
                <div className="flex justify-end">
                  <ReverseSheet
                    left={leftOf(l)}
                    target={{
                      kind: "dispatch",
                      id: l.id,
                      places: backPlaces,
                      defaultPlace: defaultBackPlace(l, backPlaces),
                    }}
                  />
                </div>
              ) : (
                showPrice &&
                leftOf(l) === 0 && <div className="text-right text-xs font-semibold text-muted-foreground">Reversed</div>
              )}
            </li>
            ),
          )}
        </ul>
      )}
      {rateMode && (
        <RateForm
          orderId={o.id}
          bags={notSent}
          billedPaise={billedPaise}
          mode={rateMode}
          hasRate={o.ratePaise !== null}
          rateHint={rateHint}
          stockBags={stockBags}
        />
      )}
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
            {historyReason(e) && <div className="text-sm">{historyReason(e)}</div>}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Where reversed bags may go: active godowns, trucks holding bags, and the active trucks these loads came from. */
async function reversePlaces(
  loads: readonly { fromVehicleId: string | null }[],
): Promise<{ value: string; label: string }[]> {
  const sourceTrucks = [...new Set(loads.map((l) => l.fromVehicleId).filter((v): v is string => v !== null))];
  const [places, trucks] = await Promise.all([
    getPlaces(),
    sourceTrucks.length
      ? db
          .select({ id: vehicles.id, number: vehicles.number })
          .from(vehicles)
          .where(and(inArray(vehicles.id, sourceTrucks), eq(vehicles.active, true)))
      : Promise.resolve([]),
  ]);
  const out = places.map((p) => ({ value: p.key, label: p.name }));
  for (const t of trucks) {
    const key = placeKey({ kind: "vehicle", id: t.id });
    if (!out.some((p) => p.value === key)) out.push({ value: key, label: t.number });
  }
  return out;
}

/** The load's own source place when it is still a choice, else nothing (the admin picks). */
function defaultBackPlace(
  load: { fromGodownId: string | null; fromVehicleId: string | null },
  places: readonly { value: string }[],
): string {
  const key = load.fromGodownId
    ? placeKey({ kind: "godown", id: load.fromGodownId })
    : load.fromVehicleId
      ? placeKey({ kind: "vehicle", id: load.fromVehicleId })
      : "";
  return places.some((p) => p.value === key) ? key : "";
}
