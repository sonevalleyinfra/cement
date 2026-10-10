"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { dispatches, orderEvents, orders, stockMovements } from "@/db/schema";
import { checkDispatchFields, planDispatch } from "@/lib/dispatch-rules";
import { isUuid } from "@/lib/ids";
import { postEntry } from "@/lib/ledger";
import { dispatchEntry } from "@/lib/ledger-rules";
import { notify } from "@/lib/notify";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { atPlace, lockPlace, truckByNumber } from "@/lib/stock-places";
import { placeColumns, placeKey } from "@/lib/stock-rules";

export type DispatchResult = { ok: true } | { ok: false; error: string };

/**
 * One truck load: stock out, one ledger debit (bags x the order's rate now), order status,
 * history and notification, all in one transaction. Any logistics person (or admin).
 */
export async function dispatchOrder(input: {
  orderId: string;
  bags: number;
  /** The truck number as typed; trucks are hired, so none are saved. */
  vehicleNumber: string;
  /** Where the bags come from: a place key ("godown:<id>" / "vehicle:<id>"). */
  fromPlace: string | null;
  driverName: string;
  driverPhone: string;
}): Promise<DispatchResult> {
  const { user: me } = await requireRole(...rolesFor("dispatch"));
  if (!isUuid(input.orderId)) return { ok: false, error: "Order not found." };

  const fields = checkDispatchFields({
    vehicleNumber: String(input.vehicleNumber ?? ""),
    fromPlace: typeof input.fromPlace === "string" ? input.fromPlace : null,
    driverName: String(input.driverName ?? ""),
    driverPhone: String(input.driverPhone ?? ""),
  });
  if (!fields.ok) return fields;

  const result = await db.transaction(async (tx): Promise<DispatchResult> => {
    // Lock the order (its rate cannot change meanwhile) and the stock place (nobody else takes the same bags).
    const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).for("no key update");
    if (!order) return { ok: false, error: "Order not found." };
    const place = await lockPlace(tx, fields.from);
    if (!place.ok) return { ok: false, error: "Pick an active stock place." };

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
      ratePaise: order.ratePaise,
      stockBalance: stock?.bags ?? 0,
    });
    if (!plan.ok) return plan;
    const debit = dispatchEntry(order, input.bags, plan.ratePaise);
    if (!debit.ok) return debit;

    // The truck is found (or made) by its number; the driver goes on this dispatch only.
    const vehicleId = await truckByNumber(tx, fields.vehicleNumber, me.id);
    const load = `${input.bags} bags in ${fields.vehicleNumber}`;
    const source = placeColumns(placeKey(fields.from));
    await tx.insert(dispatches).values({
      orderId: order.id,
      bags: input.bags,
      vehicleId,
      driverName: fields.driverName,
      driverPhone: fields.driverPhone,
      fromGodownId: source.godownId,
      fromVehicleId: source.vehicleId,
      ratePaise: plan.ratePaise,
      dispatchedBy: me.id,
    });
    await tx.insert(stockMovements).values({
      productId: order.productId,
      ...source,
      type: "dispatch",
      bags: -input.bags,
      orderId: order.id,
      reason: `Truck ${fields.vehicleNumber}`,
      actorId: me.id,
    });
    await postEntry(tx, debit.entry, me.id, load);
    await tx.insert(orderEvents).values({
      orderId: order.id,
      fromStatus: order.status,
      toStatus: plan.newStatus,
      actorId: me.id,
      reason: load,
    });
    await tx.update(orders).set({ status: plan.newStatus, updatedAt: new Date() }).where(eq(orders.id, order.id));
    await notify(tx, order.id, "dispatched", me.id, input.bags);
    return { ok: true };
  });
  if (result.ok) {
    revalidatePath("/dispatch");
    revalidatePath("/orders");
    revalidatePath(`/orders/${input.orderId}`);
    revalidatePath("/notifications");
  }
  return result;
}
