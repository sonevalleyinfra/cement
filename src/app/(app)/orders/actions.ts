"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { dispatches, orderEvents, orders, products, retailers } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { toISTDateKey } from "@/lib/datetime";
import { saveOnce } from "@/lib/form-submissions";
import { isUuid } from "@/lib/ids";
import { isBagsInRange, resolveOrderRetailer, validatePlaceOrder } from "@/lib/order-access";
import { checkDelivery, checkNotes, orderSourceFor } from "@/lib/order-delivery-rules";
import { planCancel } from "@/lib/order-rules";
import { rolesFor } from "@/lib/permissions";
import {
  canChangeRate,
  canDecide,
  canFillRate,
  checkRateChange,
  checkRateInput,
  RATE_FILLED,
  rateEditReason,
  rateOnPlace,
} from "@/lib/rate-rules";
import { checkReason, reasonText } from "@/lib/reason-codes";
import { checkRequestId } from "@/lib/request-rules";
import { orderSalesRep } from "@/lib/sales-rep-rules";
import { notify } from "@/lib/notify";
import { approveOrderInTx } from "@/lib/order-approval";
import { requireRole } from "@/lib/session";

/** The facts every order row in the activity log carries. */
function orderFacts(o: { retailerId: string; productId: string; bags: number }) {
  return { retailerId: o.retailerId, productId: o.productId, bags: o.bags };
}

export type PlaceOrderResult = { ok: true } | { ok: false; error: string };
/** `needsOverride`: the credit check is red now (maybe after another approval); pick a reason and try again. */
export type DecideResult = { ok: true } | { ok: false; error: string; needsOverride?: true };

function refresh(orderId?: string) {
  revalidatePath("/orders");
  if (orderId) revalidatePath(`/orders/${orderId}`);
  revalidatePath("/approvals");
  revalidatePath("/dispatch");
  revalidatePath("/notifications");
}

/**
 * Places an order. Sales, retailer and admin only.
 * Staff type the rate (rupees and paise per bag); a retailer never sends one.
 * Delivery, source and the two notes follow order-delivery-rules.ts (a shop's own login is always
 * "shop_app" and can only write the shop note). Note text never goes into the activity log.
 * `requestId` is the form's one-time id: a second tap places nothing more (request-rules.ts).
 */
export async function placeOrder(input: {
  retailerId: string | null;
  productId: string | null;
  bags: number;
  rateRupees?: string;
  deliverTo?: string;
  siteAddress?: string;
  receiverName?: string;
  receiverPhone?: string;
  requiredBy?: string;
  source?: string;
  staffNote?: string;
  shopNote?: string;
  requestId: string;
}): Promise<PlaceOrderResult> {
  const session = await requireRole(...rolesFor("placeOrder"));
  const request = checkRequestId(input.requestId);
  if (!request.ok) return request;
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
  const source = orderSourceFor(me.role, input.source);
  if (!source.ok) return source;
  const delivery = checkDelivery(input, toISTDateKey(new Date()));
  if (!delivery.ok) return delivery;
  const notes = checkNotes(me.role, input);
  if (!notes.ok) return notes;
  const d = delivery.delivery;

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

  const result = await saveOnce({ id: request.id, kind: "order", actorId: me.id }, async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({
        retailerId,
        productId: product.id,
        bags: input.bags,
        ratePaise: rate.ratePaise,
        status: "placed",
        deliverTo: d.deliverTo,
        siteAddress: d.siteAddress,
        receiverName: d.receiverName,
        receiverPhone: d.receiverPhone,
        requiredBy: d.requiredBy,
        source: source.source,
        staffNote: notes.staffNote,
        shopNote: notes.shopNote,
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
      details: {
        retailerId,
        productId: product.id,
        bags: input.bags,
        ratePaise: rate.ratePaise,
        source: source.source,
        deliverTo: d.deliverTo,
        requiredBy: d.requiredBy,
      },
    });
    await notify(tx, order.id, "placed", me.id);
    return { ok: true, resultId: order.id };
  });
  if (!result.ok) return result;
  refresh();
  return { ok: true };
}

/**
 * The order's sales person (or admin) fills the empty rate of a placed order (rate-rules.ts).
 * `rateText` = rupees per bag, paise allowed ("335.50"). The status stays "placed"; accounts can now approve it
 * (no notification: it shows in their "To approve" list).
 * A rate that is set is changed with changeRate (logistics or admin, reason needed).
 */
export async function fillRate(orderId: string, rateText: string): Promise<PlaceOrderResult> {
  const { user: me } = await requireRole(...rolesFor("fillRate"));
  if (!isUuid(orderId)) return { ok: false, error: "Order not found." };
  const rate = checkRateInput(String(rateText ?? ""));
  if (!rate.ok) return rate;

  const result = await db.transaction(async (tx): Promise<PlaceOrderResult> => {
    const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("no key update");
    if (!o) return { ok: false, error: "Order not found." };
    if (o.status === "placed" && o.ratePaise !== null) return { ok: false, error: "The rate is already filled." };
    if (!canFillRate(me.role, me.id, o)) return { ok: false, error: "You cannot fill the rate on this order." };
    await tx.update(orders).set({ ratePaise: rate.paise, updatedAt: new Date() }).where(eq(orders.id, orderId));
    // The reason never shows the price (retailers read the history); the rates are kept for staff only.
    await tx.insert(orderEvents).values({
      orderId,
      fromStatus: o.status,
      toStatus: o.status,
      actorId: me.id,
      reason: RATE_FILLED,
      fromRatePaise: o.ratePaise,
      toRatePaise: rate.paise,
    });
    await writeAudit(tx, {
      actorId: me.id,
      entity: "order",
      entityId: orderId,
      action: "fill_rate",
      details: { ...orderFacts(o), ratePaise: { before: o.ratePaise, after: rate.paise } },
    });
    // Nobody is notified: the order now shows in accounts' "To approve" list.
    return { ok: true };
  });
  if (result.ok) refresh(orderId);
  return result;
}

/**
 * Logistics or admin changes a rate that is set, at any step before the order is fully dispatched
 * (reason code needed, note optional; rate-rules.ts). It is billed on the bags dispatched from now on; bags already sent
 * keep their rate. Accounts, the shop's sales person and admin are told (old → new rate and why).
 */
export async function changeRate(
  orderId: string,
  rateText: string,
  reasonCode: string,
  note: string,
): Promise<PlaceOrderResult> {
  const { user: me } = await requireRole(...rolesFor("changeRate"));
  if (!isUuid(orderId)) return { ok: false, error: "Order not found." };

  const result = await db.transaction(async (tx): Promise<PlaceOrderResult> => {
    const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("no key update");
    if (!o) return { ok: false, error: "Order not found." };
    if (!canChangeRate(me.role, o)) return { ok: false, error: "The rate of this order cannot be changed." };
    const check = checkRateChange(o.ratePaise, rateText, reasonCode, note);
    if (!check.ok) return check;
    await tx.update(orders).set({ ratePaise: check.ratePaise, updatedAt: new Date() }).where(eq(orders.id, orderId));
    await tx.insert(orderEvents).values({
      orderId,
      fromStatus: o.status,
      toStatus: o.status,
      actorId: me.id,
      reason: rateEditReason(check.note),
      reasonCode: check.code,
      fromRatePaise: o.ratePaise,
      toRatePaise: check.ratePaise,
    });
    await writeAudit(tx, {
      actorId: me.id,
      entity: "order",
      entityId: orderId,
      action: "change_rate",
      details: {
        ...orderFacts(o),
        ratePaise: { before: o.ratePaise, after: check.ratePaise },
        reasonCode: check.code,
        ...(check.note ? { note: check.note } : {}),
      },
    });
    await notify(tx, orderId, "rate_edited", me.id, undefined, {
      fromPaise: o.ratePaise,
      toPaise: check.ratePaise,
      reason: reasonText(check.code, check.note, "rate_change"),
    });
    return { ok: true };
  });
  if (result.ok) refresh(orderId);
  return result;
}

/**
 * Accounts or admin approves or rejects a placed order with a rate (a reason code is needed to reject). Nothing is billed here.
 * `seenRatePaise` is the rate on their screen: if it changed meanwhile, nothing is decided (canDecide).
 * Approving runs the credit check inside the transaction (lib/order-approval.ts): over the limit, overdue
 * or a shop on hold / blocked needs `override` (an override reason code + note); without one it is refused
 * with `needsOverride`. The screen's view of the dues is never trusted. Rejecting has no credit check.
 */
export async function decideOrder(
  orderId: string,
  decision: "approved" | "rejected",
  reasonCode: string | null,
  note: string | null,
  seenRatePaise: number,
  override: { code: string; note: string } | null = null,
): Promise<DecideResult> {
  const { user: me } = await requireRole(...rolesFor("decideOrder"));
  // Only these two outcomes: anything else (e.g. "cancelled") must go through cancelOrder.
  if (decision !== "approved" && decision !== "rejected") return { ok: false, error: "Pick approve or reject." };
  if (!isUuid(orderId)) return { ok: false, error: "Order not found." };
  if (decision === "approved") {
    // Only the shape is checked here; the code and note are checked where the check is red.
    const why = override && typeof override === "object" ? { code: override.code, note: override.note } : null;
    const result = await db.transaction(async (tx): Promise<DecideResult> => {
      const res = await approveOrderInTx(tx, {
        orderId,
        actor: { id: me.id, role: me.role },
        seenRatePaise,
        override: why,
        now: new Date(),
      });
      if (!res.ok) return res;
      await notify(tx, orderId, "approved", me.id);
      return { ok: true };
    });
    if (result.ok) {
      refresh(orderId);
      revalidatePath("/reports/overrides");
    }
    return result;
  }

  const check = checkReason("reject", reasonCode, note);
  if (!check.ok) return check;
  const why = { code: check.code, note: check.note };
  const result = await db.transaction(async (tx): Promise<DecideResult> => {
    const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("no key update");
    if (!o) return { ok: false, error: "Order not found." };
    const allowed = canDecide(me.role, o, decision, seenRatePaise);
    if (!allowed.ok) return allowed;
    await tx.update(orders).set({ status: decision, updatedAt: new Date() }).where(eq(orders.id, orderId));
    await tx.insert(orderEvents).values({
      orderId,
      fromStatus: o.status,
      toStatus: decision,
      actorId: me.id,
      reason: why.note,
      reasonCode: why.code,
    });
    await writeAudit(tx, {
      actorId: me.id,
      entity: "order",
      entityId: orderId,
      action: "reject",
      details: {
        ...orderFacts(o),
        ratePaise: o.ratePaise,
        reasonCode: why.code,
        ...(why.note ? { note: why.note } : {}),
      },
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
export async function cancelOrder(orderId: string, reasonCode: string, note: string): Promise<PlaceOrderResult> {
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
      reasonCode,
      note,
    });
    if (!plan.ok) return plan;
    await tx.update(orders).set({ status: "cancelled", updatedAt: new Date() }).where(eq(orders.id, orderId));
    await tx.insert(orderEvents).values({
      orderId,
      fromStatus: o.status,
      toStatus: "cancelled",
      actorId: me.id,
      reason: plan.note,
      reasonCode: plan.code,
    });
    await writeAudit(tx, {
      actorId: me.id,
      entity: "order",
      entityId: orderId,
      action: "cancel",
      details: {
        ...orderFacts(o),
        cancelledBags: plan.cancelledBags,
        reasonCode: plan.code,
        ...(plan.note ? { note: plan.note } : {}),
      },
    });
    await notify(tx, orderId, "cancelled", me.id, plan.cancelledBags);
    return { ok: true };
  });
  if (result.ok) refresh(orderId);
  return result;
}
