"use server";

import { desc, eq, isNotNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  dispatches,
  ledgerEntries,
  orderEvents,
  orders,
  products,
  retailers,
} from "@/db/schema";
import { logisticsCandidates, stepTimes } from "@/lib/dispatch-rules";
import { isUuid } from "@/lib/ids";
import {
  canCancelOrder,
  isBagsInRange,
  resolveOrderRetailer,
  validatePlaceOrder,
} from "@/lib/order-access";
import {
  approvalStepAssignee,
  approvalSteps,
  isOrderStatus,
  lastRoundRobinAssignee,
  pickNextAssignee,
  planCancel,
} from "@/lib/order-rules";
import { rolesFor } from "@/lib/permissions";
import { canDecide, canFillRate, checkRateDigits, checkRejectReason } from "@/lib/rate-rules";
import { orderSalesRep } from "@/lib/sales-rep-rules";
import { postEntry } from "@/lib/ledger";
import { cancelEntry, orderDebitEntry, sumPaise } from "@/lib/ledger-rules";
import { logisticsPeople } from "@/lib/logistics";
import { notify } from "@/lib/notify";
import { requireRole } from "@/lib/session";

export type PlaceOrderResult = { ok: true } | { ok: false; error: string };

/** Places an order. Sales, retailer and admin only. */
export async function placeOrder(input: {
  retailerId: string | null;
  productId: string | null;
  bags: number;
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
    await notify(tx, order.id, "placed", me.id);
  });
  revalidatePath("/orders");
  revalidatePath("/notifications");
  return { ok: true };
}

const CHANGED = "This order was just changed. Refresh.";

/**
 * Moves an order one step inside a transaction, with a history row. Fails (nothing saved)
 * if it changed meanwhile. Approving also bills the retailer and picks logistics.
 */
async function moveOrder(
  orderId: string,
  from: "placed" | "rate_filled",
  to: "rate_filled" | "approved" | "rejected",
  actorId: string,
  reason: string,
  extra: { ratePaise?: number } = {},
): Promise<PlaceOrderResult> {
  const result = await db.transaction(async (tx): Promise<PlaceOrderResult> => {
    // Lock the order and check everything before writing, so a refusal saves nothing.
    const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("no key update");
    if (!o || o.status !== from) return { ok: false, error: CHANGED };

    if (to !== "approved") {
      await tx.update(orders).set({ status: to, updatedAt: new Date(), ...extra }).where(eq(orders.id, orderId));
      await tx.insert(orderEvents).values({ orderId, fromStatus: from, toStatus: to, actorId, reason });
      await notify(tx, orderId, to, actorId);
      return { ok: true };
    }

    // The money side: approval bills the retailer (bags x rate) in their ledger.
    const debit = orderDebitEntry(o);
    if (!debit.ok) return { ok: false, error: debit.error };

    // Round robin (spec 4.5). Approvals take turns: this lock (held until the transaction ends)
    // makes a second approval wait here, so two approvals never pick the same "next" person.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('order_approval_round_robin'))`);
    const people = await logisticsPeople(tx);
    // "Last" = whoever round robin picked most recently (dispatch take-overs do not count).
    const recent = await tx
      .select({ assigneeId: orderEvents.assigneeId, createdAt: orderEvents.createdAt })
      .from(orderEvents)
      .where(isNotNull(orderEvents.assigneeId))
      .orderBy(desc(orderEvents.createdAt))
      .limit(1);
    const logisticsId = pickNextAssignee(logisticsCandidates(people), lastRoundRobinAssignee(recent));
    const next = approvalSteps(logisticsId);

    // Save the assignee before notify: "assigned" goes to orders.logistics_id.
    await tx
      .update(orders)
      .set({ status: next.status, logisticsId, updatedAt: new Date() })
      .where(eq(orders.id, orderId));
    await postEntry(tx, debit.entry, actorId, "Order approved");
    // Times taken after the lock, so the next approval's rows always come later.
    const times = stepTimes(new Date(), next.steps.length);
    let fromStatus: string = from;
    for (const [i, step] of next.steps.entries()) {
      await tx.insert(orderEvents).values({
        createdAt: times[i],
        orderId,
        fromStatus,
        toStatus: step,
        actorId,
        reason: step === "approved" ? reason : "",
        assigneeId: approvalStepAssignee(step, logisticsId),
      });
      fromStatus = step;
    }
    await notify(tx, orderId, "approved", actorId);
    if (logisticsId) await notify(tx, orderId, "assigned", actorId);
    return { ok: true };
  });
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/approvals");
  revalidatePath("/dispatch");
  revalidatePath("/notifications");
  return result;
}

async function loadOrder(orderId: string) {
  if (!isUuid(orderId)) return null;
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  return order ?? null;
}

/** Sales (the assigned rep) or admin enters the rate per bag (whole rupees). Moves to pending approval. */
export async function fillRate(orderId: string, rupeeDigits: string): Promise<PlaceOrderResult> {
  const session = await requireRole(...rolesFor("fillRate"));
  const order = await loadOrder(orderId);
  if (!order) return { ok: false, error: "Order not found." };
  const me = session.user;
  if (!canFillRate(me.role, me.id, order.salesRepId, order.status)) {
    return { ok: false, error: "You cannot fill the rate on this order." };
  }
  const rate = checkRateDigits(String(rupeeDigits ?? ""));
  if (!rate.ok) return rate;
  return moveOrder(order.id, "placed", "rate_filled", me.id, "", { ratePaise: rate.paise });
}

/** Accounts or admin approves or rejects (reason needed to reject). */
export async function decideOrder(
  orderId: string,
  decision: "approved" | "rejected",
  reason?: string,
): Promise<PlaceOrderResult> {
  const session = await requireRole(...rolesFor("decideOrder"));
  // Only these two outcomes: anything else (e.g. "cancelled") must go through cancelOrder.
  if (decision !== "approved" && decision !== "rejected") return { ok: false, error: "Pick approve or reject." };
  const order = await loadOrder(orderId);
  if (!order) return { ok: false, error: "Order not found." };
  if (!canDecide(session.user.role, order.status, decision)) {
    return { ok: false, error: "This order is not waiting for approval." };
  }
  let why = "";
  if (decision === "rejected") {
    const check = checkRejectReason(typeof reason === "string" ? reason : "");
    if (!check.ok) return check;
    why = check.reason;
  }
  return moveOrder(order.id, "rate_filled", decision, session.user.id, why);
}

/**
 * Cancels an order (rules in planCancel). No stock moves. Before any bag is sent the whole
 * bill is reversed. Once some bags went out it "closes short": the order becomes dispatched
 * and only the bags not sent come off the bill.
 */
export async function cancelOrder(orderId: string, reason: string): Promise<PlaceOrderResult> {
  const { user: me } = await requireRole("sales", "accounts");
  const order = await loadOrder(orderId);
  if (!order) return { ok: false, error: "Order not found." };

  const result = await db.transaction(async (tx): Promise<PlaceOrderResult> => {
    const [locked] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("no key update");
    if (!locked || !isOrderStatus(locked.status)) return { ok: false, error: "Order not found." };
    if (!canCancelOrder(me.role, me.id, locked)) {
      return { ok: false, error: "You cannot cancel this order." };
    }
    const sent = await tx.select({ bags: dispatches.bags }).from(dispatches).where(eq(dispatches.orderId, orderId));
    const posted = await tx
      .select({ amountPaise: ledgerEntries.amountPaise })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.orderId, orderId));
    const plan = planCancel({
      status: locked.status,
      orderedBags: locked.bags,
      dispatchedBags: sent.reduce((n, d) => n + d.bags, 0),
      ratePaise: locked.ratePaise,
      postedNetPaise: sumPaise(posted),
      reason: String(reason ?? ""),
    });
    if (!plan.ok) return plan;
    const closedShort = plan.closedShortBags !== null;

    const entry = cancelEntry(locked, plan.ledgerPaise);
    if (entry) await postEntry(tx, entry, me.id, closedShort ? "Order closed short" : "Order cancelled");
    await tx.update(orders).set({ status: plan.newStatus, updatedAt: new Date() }).where(eq(orders.id, orderId));
    await tx.insert(orderEvents).values({
      orderId,
      fromStatus: locked.status,
      toStatus: plan.newStatus,
      actorId: me.id,
      reason: plan.historyReason,
    });
    await notify(tx, orderId, "cancelled", me.id, plan.closedShortBags ?? undefined);
    return { ok: true };
  });
  if (result.ok) {
    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/dispatch");
    revalidatePath("/notifications");
  }
  return result;
}
