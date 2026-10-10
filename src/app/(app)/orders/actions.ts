"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { dispatches, orderEvents, orders, products, retailers } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { isUuid } from "@/lib/ids";
import { isBagsInRange, resolveOrderRetailer, validatePlaceOrder } from "@/lib/order-access";
import { planCancel } from "@/lib/order-rules";
import { rolesFor } from "@/lib/permissions";
import {
  canChangeRate,
  canDecide,
  canFillRate,
  checkRateChange,
  checkRateDigits,
  checkRejectReason,
  RATE_FILLED,
  rateEditReason,
  rateOnPlace,
} from "@/lib/rate-rules";
import { orderSalesRep } from "@/lib/sales-rep-rules";
import { notify } from "@/lib/notify";
import { requireRole } from "@/lib/session";

/** The facts every order row in the activity log carries. */
function orderFacts(o: { retailerId: string; productId: string; bags: number }) {
  return { retailerId: o.retailerId, productId: o.productId, bags: o.bags };
}

export type PlaceOrderResult = { ok: true } | { ok: false; error: string };

function refresh(orderId?: string) {
  revalidatePath("/orders");
  if (orderId) revalidatePath(`/orders/${orderId}`);
  revalidatePath("/approvals");
  revalidatePath("/dispatch");
  revalidatePath("/notifications");
}

/**
 * Places an order. Sales, retailer and admin only.
 * Staff type the rate (whole rupees per bag); a retailer never sends one.
 */
export async function placeOrder(input: {
  retailerId: string | null;
  productId: string | null;
  bags: number;
  rateRupees?: string;
  notes?: string;
}): Promise<PlaceOrderResult> {
  const session = await requireRole(...rolesFor("placeOrder"));
  const check = validatePlaceOrder({
    bags: input.bags,
    retailerId: input.retailerId,
    productId: input.productId,
  });
  if (!check.ok) return check;
  if (!isBagsInRange(input.bags)) return { ok: false, error: "That is too many bags." };
  if (!isUuid(input.productId) || (input.retailerId !== null && !isUuid(input.retailerId))) {
    return { ok: false, error: "Refresh the page and try again." };
  }

  const me = session.user;
  const rate = rateOnPlace(me.role, input.rateRupees);
  if (!rate.ok) return rate;

  const [own] = await db
    .select({ id: retailers.id })
    .from(retailers)
    .where(eq(retailers.userId, me.id))
    .limit(1);
  const retailerId = resolveOrderRetailer(me.role, own?.id ?? null, input.retailerId);
  if (!retailerId) return { ok: false, error: "Your login is not linked to a retailer. Ask admin." };

  const [retailer] = await db.select().from(retailers).where(eq(retailers.id, retailerId)).limit(1);
  if (!retailer || !retailer.active) return { ok: false, error: "Retailer not available." };
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, input.productId as string))
    .limit(1);
  if (!product || !product.active) return { ok: false, error: "Product not available." };

  // The shop's own sales person gets the order (rules in sales-rep-rules.ts).
  const salesRepId = orderSalesRep(retailer.salesRepId, { id: me.id, role: me.role });

  await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({
        retailerId,
        productId: product.id,
        bags: input.bags,
        ratePaise: rate.ratePaise,
        status: "placed",
        notes: String(input.notes ?? "").trim().slice(0, 500),
        placedBy: me.id,
        salesRepId,
      })
      .returning({ id: orders.id });
    await tx.insert(orderEvents).values({
      orderId: order.id,
      fromStatus: null,
      toStatus: "placed",
      actorId: me.id,
    });
    await writeAudit(tx, {
      actorId: me.id,
      entity: "order",
      entityId: order.id,
      action: "place",
      details: { retailerId, productId: product.id, bags: input.bags, ratePaise: rate.ratePaise },
    });
    await notify(tx, order.id, "placed", me.id);
  });
  refresh();
  return { ok: true };
}

/**
 * The order's sales person (or admin) fills or changes the rate while the order is placed.
 * `rupeeDigits` = whole rupees per bag. The status stays "placed"; accounts can now approve it.
 */
export async function fillRate(orderId: string, rupeeDigits: string): Promise<PlaceOrderResult> {
  const { user: me } = await requireRole(...rolesFor("fillRate"));
  if (!isUuid(orderId)) return { ok: false, error: "Order not found." };
  const rate = checkRateDigits(String(rupeeDigits ?? ""));
  if (!rate.ok) return rate;

  const result = await db.transaction(async (tx): Promise<PlaceOrderResult> => {
    const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("no key update");
    if (!o) return { ok: false, error: "Order not found." };
    if (!canFillRate(me.role, me.id, o)) return { ok: false, error: "You cannot fill the rate on this order." };
    if (o.ratePaise === rate.paise) return { ok: true };
    await tx.update(orders).set({ ratePaise: rate.paise, updatedAt: new Date() }).where(eq(orders.id, orderId));
    // The history row never shows the price (retailers read the history).
    await tx.insert(orderEvents).values({
      orderId,
      fromStatus: o.status,
      toStatus: o.status,
      actorId: me.id,
      reason: RATE_FILLED,
    });
    await writeAudit(tx, {
      actorId: me.id,
      entity: "order",
      entityId: orderId,
      action: "fill_rate",
      details: { ...orderFacts(o), ratePaise: { before: o.ratePaise, after: rate.paise } },
    });
    await notify(tx, orderId, "rate_filled", me.id);
    return { ok: true };
  });
  if (result.ok) refresh(orderId);
  return result;
}

/**
 * Logistics or admin changes the rate of an approved or partly dispatched order (reason needed).
 * It is billed on the bags dispatched from now on; bags already sent keep their rate.
 */
export async function changeRate(orderId: string, rupeeDigits: string, reason: string): Promise<PlaceOrderResult> {
  const { user: me } = await requireRole(...rolesFor("changeRate"));
  if (!isUuid(orderId)) return { ok: false, error: "Order not found." };

  const result = await db.transaction(async (tx): Promise<PlaceOrderResult> => {
    const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("no key update");
    if (!o) return { ok: false, error: "Order not found." };
    if (!canChangeRate(me.role, o.status)) return { ok: false, error: "The rate of this order cannot be changed." };
    const check = checkRateChange(o.ratePaise, rupeeDigits, reason);
    if (!check.ok) return check;
    await tx.update(orders).set({ ratePaise: check.ratePaise, updatedAt: new Date() }).where(eq(orders.id, orderId));
    await tx.insert(orderEvents).values({
      orderId,
      fromStatus: o.status,
      toStatus: o.status,
      actorId: me.id,
      reason: rateEditReason(check.reason),
    });
    await writeAudit(tx, {
      actorId: me.id,
      entity: "order",
      entityId: orderId,
      action: "change_rate",
      details: { ...orderFacts(o), ratePaise: { before: o.ratePaise, after: check.ratePaise }, reason: check.reason },
    });
    await notify(tx, orderId, "rate_edited", me.id);
    return { ok: true };
  });
  if (result.ok) refresh(orderId);
  return result;
}

/** Accounts or admin approves or rejects a placed order with a rate (reason needed to reject). Nothing is billed here. */
export async function decideOrder(
  orderId: string,
  decision: "approved" | "rejected",
  reason?: string,
): Promise<PlaceOrderResult> {
  const { user: me } = await requireRole(...rolesFor("decideOrder"));
  // Only these two outcomes: anything else (e.g. "cancelled") must go through cancelOrder.
  if (decision !== "approved" && decision !== "rejected") return { ok: false, error: "Pick approve or reject." };
  if (!isUuid(orderId)) return { ok: false, error: "Order not found." };
  let why = "";
  if (decision === "rejected") {
    const check = checkRejectReason(typeof reason === "string" ? reason : "");
    if (!check.ok) return check;
    why = check.reason;
  }

  const result = await db.transaction(async (tx): Promise<PlaceOrderResult> => {
    const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("no key update");
    if (!o) return { ok: false, error: "Order not found." };
    const allowed = canDecide(me.role, o, decision);
    if (!allowed.ok) return allowed;
    await tx.update(orders).set({ status: decision, updatedAt: new Date() }).where(eq(orders.id, orderId));
    await tx.insert(orderEvents).values({ orderId, fromStatus: o.status, toStatus: decision, actorId: me.id, reason: why });
    await writeAudit(tx, {
      actorId: me.id,
      entity: "order",
      entityId: orderId,
      action: decision === "approved" ? "approve" : "reject",
      details: { ...orderFacts(o), ratePaise: o.ratePaise, ...(why ? { reason: why } : {}) },
    });
    await notify(tx, orderId, decision, me.id);
    return { ok: true };
  });
  if (result.ok) refresh(orderId);
  return result;
}

/**
 * Admin cancels the bags not dispatched yet (rules in planCancel). No stock moves and nothing is
 * posted: only dispatched bags were billed, and they stay billed.
 */
export async function cancelOrder(orderId: string, reason: string): Promise<PlaceOrderResult> {
  const { user: me } = await requireRole(...rolesFor("cancelOrder"));
  if (!isUuid(orderId)) return { ok: false, error: "Order not found." };

  const result = await db.transaction(async (tx): Promise<PlaceOrderResult> => {
    const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("no key update");
    if (!o) return { ok: false, error: "Order not found." };
    const [sent] = await tx
      .select({ bags: sql<number>`coalesce(sum(${dispatches.bags}), 0)`.mapWith(Number) })
      .from(dispatches)
      .where(eq(dispatches.orderId, orderId));
    const plan = planCancel({
      role: me.role,
      status: o.status,
      orderedBags: o.bags,
      dispatchedBags: sent?.bags ?? 0,
      reason: String(reason ?? ""),
    });
    if (!plan.ok) return plan;
    await tx.update(orders).set({ status: "cancelled", updatedAt: new Date() }).where(eq(orders.id, orderId));
    await tx.insert(orderEvents).values({
      orderId,
      fromStatus: o.status,
      toStatus: "cancelled",
      actorId: me.id,
      reason: plan.reason,
    });
    await writeAudit(tx, {
      actorId: me.id,
      entity: "order",
      entityId: orderId,
      action: "cancel",
      details: { ...orderFacts(o), cancelledBags: plan.cancelledBags, reason: plan.reason },
    });
    await notify(tx, orderId, "cancelled", me.id, plan.cancelledBags);
    return { ok: true };
  });
  if (result.ok) refresh(orderId);
  return result;
}
