"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { dispatches, orderEvents, orders, stockMovements } from "@/db/schema";
import {
  assigneeAfterDispatch,
  canDispatchOrder,
  canMarkDelivered,
  checkDispatchFields,
  checkRateEdit,
  planDispatch,
  rateEditReason,
  stepTimes,
} from "@/lib/dispatch-rules";
import { isUuid } from "@/lib/ids";
import { postEntry } from "@/lib/ledger";
import { truckRateChangeEntry } from "@/lib/ledger-rules";
import { isAssigneeStillValid } from "@/lib/logistics";
import { notify } from "@/lib/notify";
import { canUserTransition, isOrderStatus } from "@/lib/order-rules";
import { rolesFor } from "@/lib/permissions";
import { checkRateDigits } from "@/lib/rate-rules";
import { requireRole } from "@/lib/session";
import { atPlace, lockPlace, truckByNumber } from "@/lib/stock-places";
import { placeColumns, placeKey } from "@/lib/stock-rules";

export type DispatchResult = { ok: true } | { ok: false; error: string };

function refresh(orderId: string) {
  revalidatePath("/dispatch");
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/notifications");
}

/** One truck load: stock out, order status, history and notification, all in one transaction. */
export async function dispatchOrder(input: {
  orderId: string;
  bags: number;
  /** The truck number as typed; trucks are hired, so none are saved. */
  vehicleNumber: string;
  /** Where the bags come from: a place key ("godown:<id>" / "vehicle:<id>"). */
  fromPlace: string | null;
  driverName: string;
  driverPhone: string;
  /** Optional new rate per bag in whole rupees (digits). Needs a reason. */
  newRateRupees?: string;
  rateReason?: string;
}): Promise<DispatchResult> {
  const session = await requireRole(...rolesFor("dispatch"));
  if (!isUuid(input.orderId)) return { ok: false, error: "Order not found." };

  const fields = checkDispatchFields({
    vehicleNumber: String(input.vehicleNumber ?? ""),
    fromPlace: typeof input.fromPlace === "string" ? input.fromPlace : null,
    driverName: String(input.driverName ?? ""),
    driverPhone: String(input.driverPhone ?? ""),
  });
  if (!fields.ok) return fields;

  const digits = String(input.newRateRupees ?? "").trim();
  let wantedRate: number | null = null;
  if (digits) {
    const checked = checkRateDigits(digits);
    if (!checked.ok) return checked;
    wantedRate = checked.paise;
  }

  const me = session.user;
  const result = await db.transaction(async (tx): Promise<DispatchResult> => {
    // Lock the order and the stock place so two people cannot dispatch the same bags.
    const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).for("no key update");
    if (!order) return { ok: false, error: "Order not found." };
    // Only the assignee (or anyone, when there is none or they can no longer do it), or admin.
    const assigneeValid = await isAssigneeStillValid(tx, order.logisticsId);
    if (!canDispatchOrder({ id: me.id, role: me.role }, order, assigneeValid)) {
      return { ok: false, error: "This order is assigned to someone else." };
    }
    // The godown or truck must still be switched on; locked so nobody else takes the same bags.
    const place = await lockPlace(tx, fields.from);
    if (!place.ok) return { ok: false, error: "Pick an active stock place." };
    // The truck is found (or made) by its number; the driver goes on this dispatch only.
    const vehicle = { id: await truckByNumber(tx, fields.vehicleNumber, me.id), number: fields.vehicleNumber };

    const [sent] = await tx
      .select({ bags: sql<number>`coalesce(sum(${dispatches.bags}), 0)`.mapWith(Number) })
      .from(dispatches)
      .where(eq(dispatches.orderId, order.id));
    const [stock] = await tx
      .select({ bags: sql<number>`coalesce(sum(${stockMovements.bags}), 0)`.mapWith(Number) })
      .from(stockMovements)
      .where(and(eq(stockMovements.productId, order.productId), atPlace(fields.from)));

    const plan = planDispatch({
      status: order.status,
      orderedBags: order.bags,
      alreadyDispatchedBags: sent?.bags ?? 0,
      bags: input.bags,
      stockBalance: stock?.bags ?? 0,
    });
    if (!plan.ok) return plan;
    const rate = checkRateEdit(order.ratePaise, wantedRate, input.rateReason);
    if (!rate.ok) return rate;
    // A truck rate is billed as the difference from the order rate, so the order needs one.
    const rateChange =
      rate.newRatePaise === null ? null : truckRateChangeEntry(order, input.bags, order.ratePaise, rate.newRatePaise);
    if (rate.newRatePaise !== null && !rateChange) return { ok: false, error: "This order has no rate yet." };

    const source = placeColumns(placeKey(fields.from));
    await tx.insert(dispatches).values({
      orderId: order.id,
      bags: input.bags,
      vehicleId: vehicle.id,
      driverName: fields.driverName,
      driverPhone: fields.driverPhone,
      fromGodownId: source.godownId,
      fromVehicleId: source.vehicleId,
      ratePaise: rate.newRatePaise,
      dispatchedBy: me.id,
    });
    await tx.insert(stockMovements).values({
      productId: order.productId,
      ...source,
      type: "dispatch",
      bags: -input.bags,
      orderId: order.id,
      reason: `Truck ${vehicle.number}`,
      actorId: me.id,
    });

    let from = order.status;
    if (rateChange) {
      // This truck only: the order rate stays for the other trucks (the truck rate is on the dispatch).
      await postEntry(tx, rateChange, me.id, rateEditReason(rate.reason));
      // The history never shows the price itself (retailers read it).
      await tx.insert(orderEvents).values({
        orderId: order.id,
        fromStatus: from,
        toStatus: from,
        actorId: me.id,
        reason: rateEditReason(rate.reason),
      });
    }
    const times = stepTimes(new Date(Date.now() + 5), plan.statusSteps.length);
    for (const [i, step] of plan.statusSteps.entries()) {
      await tx.insert(orderEvents).values({
        createdAt: times[i],
        orderId: order.id,
        fromStatus: from,
        toStatus: step,
        actorId: me.id,
        reason: step === "assigned" ? "" : `${input.bags} bags in ${vehicle.number}`,
      });
      from = step;
    }
    await tx
      .update(orders)
      .set({
        status: plan.newStatus,
        // An order with nobody (valid) on it becomes the dispatcher's.
        logisticsId: assigneeAfterDispatch(order.logisticsId, me.id, assigneeValid),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));
    if (rateChange) await notify(tx, order.id, "rate_edited", me.id, input.bags);
    await notify(tx, order.id, "dispatched", me.id, input.bags);
    return { ok: true };
  });
  if (result.ok) refresh(input.orderId);
  return result;
}

/** Logistics marks a fully dispatched order as delivered. */
export async function markDelivered(orderId: string): Promise<DispatchResult> {
  const session = await requireRole(...rolesFor("markDelivered"));
  if (!isUuid(orderId)) return { ok: false, error: "Order not found." };

  const me = session.user;
  const result = await db.transaction(async (tx): Promise<DispatchResult> => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("no key update");
    if (!order) return { ok: false, error: "Order not found." };
    const assigneeValid = await isAssigneeStillValid(tx, order.logisticsId);
    if (!canDispatchOrder({ id: me.id, role: me.role }, order, assigneeValid)) {
      return { ok: false, error: "This order is assigned to someone else." };
    }
    if (
      !canMarkDelivered(order.status) ||
      !isOrderStatus(order.status) ||
      !canUserTransition(me.role, order.status, "delivered")
    ) {
      return { ok: false, error: "Only a fully dispatched order can be marked delivered." };
    }
    await tx.update(orders).set({ status: "delivered", updatedAt: new Date() }).where(eq(orders.id, orderId));
    await tx.insert(orderEvents).values({
      orderId,
      fromStatus: order.status,
      toStatus: "delivered",
      actorId: me.id,
    });
    await notify(tx, orderId, "delivered", me.id);
    return { ok: true };
  });
  if (result.ok) refresh(orderId);
  return result;
}
