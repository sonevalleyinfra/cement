"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getFirmSelection } from "@/components/app/firm-switcher";
import { db } from "@/db";
import { dispatches, orderEvents, orders, stockLocations, stockMovements, vehicles } from "@/db/schema";
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
import { requireAdmin, requireFirm, requireRole, writeBlock } from "@/lib/session";

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
  vehicleId: string | null;
  locationId: string | null;
  driverName: string;
  driverPhone: string;
  /** Optional new rate per bag in whole rupees (digits). Needs a reason. */
  newRateRupees?: string;
  rateReason?: string;
}): Promise<DispatchResult> {
  const session = await requireRole(...rolesFor("dispatch"));
  const blocked = await writeBlock();
  if (blocked) return { ok: false, error: blocked };
  if (!isUuid(input.orderId)) return { ok: false, error: "Order not found." };
  if ((input.vehicleId && !isUuid(input.vehicleId)) || (input.locationId && !isUuid(input.locationId))) {
    return { ok: false, error: "Refresh the page and try again." };
  }
  const [found] = await db
    .select({ firmId: orders.firmId })
    .from(orders)
    .where(eq(orders.id, input.orderId))
    .limit(1);
  if (!found) return { ok: false, error: "Order not found." };
  await requireFirm(found.firmId);
  const { selection } = await getFirmSelection();

  const fields = checkDispatchFields({
    readOnlyMode: selection.readOnly || selection.firmId !== found.firmId,
    vehicleId: input.vehicleId,
    locationId: input.locationId,
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
    const assigneeValid = await isAssigneeStillValid(tx, order.firmId, order.logisticsId);
    if (!canDispatchOrder({ id: me.id, role: me.role, hasFirmAccess: true }, order, assigneeValid)) {
      return { ok: false, error: "This order is assigned to someone else." };
    }
    const [loc] = await tx
      .select()
      .from(stockLocations)
      .where(eq(stockLocations.id, input.locationId as string))
      .for("no key update");
    if (!loc || loc.firmId !== order.firmId || !loc.active) {
      return { ok: false, error: "Pick a stock place of this firm." };
    }
    const [vehicle] = await tx
      .select()
      .from(vehicles)
      .where(eq(vehicles.id, input.vehicleId as string))
      .limit(1);
    if (!vehicle || !vehicle.active) return { ok: false, error: "Pick an active vehicle." };

    const [sent] = await tx
      .select({ bags: sql<number>`coalesce(sum(${dispatches.bags}), 0)`.mapWith(Number) })
      .from(dispatches)
      .where(eq(dispatches.orderId, order.id));
    const [stock] = await tx
      .select({ bags: sql<number>`coalesce(sum(${stockMovements.bags}), 0)`.mapWith(Number) })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.firmId, order.firmId),
          eq(stockMovements.productId, order.productId),
          eq(stockMovements.locationId, loc.id),
        ),
      );

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

    await tx.insert(dispatches).values({
      firmId: order.firmId,
      orderId: order.id,
      bags: input.bags,
      vehicleId: vehicle.id,
      driverName: fields.driverName,
      driverPhone: fields.driverPhone,
      locationId: loc.id,
      ratePaise: rate.newRatePaise,
      dispatchedBy: me.id,
    });
    await tx.insert(stockMovements).values({
      firmId: order.firmId,
      productId: order.productId,
      locationId: loc.id,
      type: "dispatch",
      bags: -input.bags,
      orderId: order.id,
      reason: `Vehicle ${vehicle.number}`,
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
  const [found] = await db
    .select({ firmId: orders.firmId })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!found) return { ok: false, error: "Order not found." };
  await requireFirm(found.firmId);
  const blocked = await writeBlock();
  if (blocked) return { ok: false, error: blocked };
  // Same as dispatch: the firm on screen must be the order's firm.
  const { selection } = await getFirmSelection();
  if (selection.readOnly || selection.firmId !== found.firmId) return { ok: false, error: "Pick this order's firm first." };

  const me = session.user;
  const result = await db.transaction(async (tx): Promise<DispatchResult> => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("no key update");
    if (!order) return { ok: false, error: "Order not found." };
    const assigneeValid = await isAssigneeStillValid(tx, order.firmId, order.logisticsId);
    if (!canDispatchOrder({ id: me.id, role: me.role, hasFirmAccess: true }, order, assigneeValid)) {
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

/** Admin adds a godown for the chosen firm (task 11 adds a full screen for this). */
export async function createGodown(firmId: string, name: string): Promise<DispatchResult> {
  await requireAdmin();
  await requireFirm(firmId);
  const blocked = await writeBlock();
  if (blocked) return { ok: false, error: blocked };
  const clean = String(name ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (!clean) return { ok: false, error: "Enter a name for the godown." };
  await db.insert(stockLocations).values({ firmId, kind: "godown", name: clean });
  revalidatePath("/dispatch");
  return { ok: true };
}
