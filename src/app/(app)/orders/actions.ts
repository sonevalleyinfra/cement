"use server";

import { and, asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  dispatches,
  ledgerEntries,
  orderEvents,
  orders,
  products,
  retailers,
  stockMovements,
  user,
  userFirms,
} from "@/db/schema";
import { isUuid } from "@/lib/ids";
import {
  canCancelOrder,
  isBagsInRange,
  resolveOrderRetailer,
  validatePlaceOrder,
} from "@/lib/order-access";
import { cancelDecision, isOrderStatus, pickNextAssignee } from "@/lib/order-rules";
import { rolesFor } from "@/lib/permissions";
import { reversalMovements, type MovementType } from "@/lib/stock-rules";
import { hasRole } from "@/lib/roles";
import { canDecide, canFillRate, checkRejectReason, ratePaiseFromRupeeDigits } from "@/lib/rate-rules";
import { postEntry } from "@/lib/ledger";
import { cancelReversalEntry, orderDebitEntry } from "@/lib/ledger-rules";
import { notify } from "@/lib/notify";
import { requireFirm, requireRole, writeBlock } from "@/lib/session";

export type PlaceOrderResult = { ok: true } | { ok: false; error: string };

/** Places an order for one firm. Sales, retailer and admin only. */
export async function placeOrder(input: {
  firmId: string | null;
  retailerId: string | null;
  productId: string | null;
  bags: number;
  notes?: string;
}): Promise<PlaceOrderResult> {
  const session = await requireRole(...rolesFor("placeOrder"));
  const blocked = await writeBlock();
  if (blocked) return { ok: false, error: blocked };
  const check = validatePlaceOrder({
    readOnlyMode: !input.firmId,
    bags: input.bags,
    retailerId: input.retailerId,
    productId: input.productId,
  });
  if (!check.ok) return check;
  if (!isBagsInRange(input.bags)) return { ok: false, error: "That is too many bags." };
  if (!isUuid(input.firmId) || !isUuid(input.productId) || (input.retailerId !== null && !isUuid(input.retailerId))) {
    return { ok: false, error: "Refresh the page and try again." };
  }

  // Firm access is checked here, never trusted from the screen.
  const { firm } = await requireFirm(input.firmId as string);
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

  // Round robin among active sales people who work on this firm.
  const people = await db
    .select({ id: user.id, role: user.role, banned: user.banned })
    .from(userFirms)
    .innerJoin(user, eq(userFirms.userId, user.id))
    .where(eq(userFirms.firmId, firm.id))
    .orderBy(asc(user.id));
  const candidates = people
    .filter((p) => hasRole(p.role, "sales"))
    .map((p) => ({ id: p.id, active: !p.banned }));
  const [last] = await db
    .select({ salesRepId: orders.salesRepId })
    .from(orders)
    .where(eq(orders.firmId, firm.id))
    .orderBy(desc(orders.createdAt))
    .limit(1);
  const salesRepId = pickNextAssignee(candidates, last?.salesRepId);

  await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({
        firmId: firm.id,
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

/** Moves an order one step inside a transaction, with a history row. Fails if it changed meanwhile. */
async function moveOrder(
  orderId: string,
  from: "placed" | "rate_filled",
  to: "rate_filled" | "approved" | "rejected",
  actorId: string,
  reason: string,
  extra: { ratePaise?: number } = {},
): Promise<boolean> {
  const done = await db.transaction(async (tx) => {
    const updated = await tx
      .update(orders)
      .set({ status: to, updatedAt: new Date(), ...extra })
      .where(and(eq(orders.id, orderId), eq(orders.status, from)))
      .returning({ id: orders.id });
    if (updated.length === 0) return false;
    if (to === "approved") {
      // The money side: approval bills the retailer (bags x rate) in this firm's ledger.
      const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      const debit = orderDebitEntry({ ...o });
      if (!debit.ok) throw new Error(debit.error);
      await postEntry(tx, debit.entry, actorId, "Order approved");
    }
    await tx.insert(orderEvents).values({ orderId, fromStatus: from, toStatus: to, actorId, reason });
    await notify(tx, orderId, to === "rate_filled" ? "rate_filled" : to, actorId);
    return true;
  });
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/approvals");
  revalidatePath("/notifications");
  return done;
}

async function loadOrder(orderId: string) {
  if (!isUuid(orderId)) return null;
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  return order ?? null;
}

/** Sales (the assigned rep) or admin enters the rate per bag (whole rupees). Moves to pending approval. */
export async function fillRate(orderId: string, rupeeDigits: string): Promise<PlaceOrderResult> {
  const session = await requireRole(...rolesFor("fillRate"));
  const blocked = await writeBlock();
  if (blocked) return { ok: false, error: blocked };
  const order = await loadOrder(orderId);
  if (!order) return { ok: false, error: "Order not found." };
  await requireFirm(order.firmId);
  const me = session.user;
  if (!canFillRate(me.role, me.id, order.salesRepId, order.status)) {
    return { ok: false, error: "You cannot fill the rate on this order." };
  }
  const ratePaise = ratePaiseFromRupeeDigits(String(rupeeDigits ?? ""));
  if (ratePaise === null) return { ok: false, error: "Enter a rate per bag." };
  const ok = await moveOrder(order.id, "placed", "rate_filled", me.id, "", { ratePaise });
  return ok ? { ok: true } : { ok: false, error: "This order was just changed. Refresh." };
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
  const blocked = await writeBlock();
  if (blocked) return { ok: false, error: blocked };
  const order = await loadOrder(orderId);
  if (!order) return { ok: false, error: "Order not found." };
  await requireFirm(order.firmId);
  if (!canDecide(session.user.role, order.status, decision)) {
    return { ok: false, error: "This order is not waiting for approval." };
  }
  let why = "";
  if (decision === "rejected") {
    const check = checkRejectReason(typeof reason === "string" ? reason : "");
    if (!check.ok) return check;
    why = check.reason;
  }
  const ok = await moveOrder(order.id, "rate_filled", decision, session.user.id, why);
  return ok ? { ok: true } : { ok: false, error: "This order was just changed. Refresh." };
}

/**
 * Cancels an order. Before approval no stock was touched; after approval the bags
 * already dispatched go back to the same firm's stock (reversal movements).
 */
export async function cancelOrder(orderId: string, reason: string): Promise<PlaceOrderResult> {
  const { user: me } = await requireRole("sales", "accounts");
  const blocked = await writeBlock();
  if (blocked) return { ok: false, error: blocked };
  const order = await loadOrder(orderId);
  if (!order) return { ok: false, error: "Order not found." };
  await requireFirm(order.firmId);
  const why = String(reason ?? "");

  const result = await db.transaction(async (tx): Promise<PlaceOrderResult> => {
    const [locked] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!locked || !isOrderStatus(locked.status)) return { ok: false, error: "Order not found." };
    if (!canCancelOrder(me.role, me.id, locked)) {
      return { ok: false, error: "You cannot cancel this order." };
    }
    const sent = await tx.select().from(dispatches).where(eq(dispatches.orderId, orderId));
    const dispatchedBags = sent.reduce((n, d) => n + d.bags, 0);
    const decision = cancelDecision(locked.status, dispatchedBags, why);
    if (!decision.ok) return decision;

    if (decision.reverseStockBags > 0) {
      const rows = await tx.select().from(stockMovements).where(eq(stockMovements.orderId, orderId));
      const back = reversalMovements(
        rows.map((r) => ({ ...r, type: r.type as MovementType })),
        orderId,
      );
      if (back.length > 0) {
        await tx.insert(stockMovements).values(back.map((m) => ({ ...m, actorId: me.id })));
      }
    }
    // Compensating entry: cancels whatever was billed for this order (nothing before approval).
    const posted = await tx.select().from(ledgerEntries).where(eq(ledgerEntries.orderId, orderId));
    const reversal = cancelReversalEntry(locked, posted);
    if (reversal) await postEntry(tx, reversal, me.id, "Order cancelled");
    await tx.update(orders).set({ status: "cancelled", updatedAt: new Date() }).where(eq(orders.id, orderId));
    await tx.insert(orderEvents).values({
      orderId,
      fromStatus: locked.status,
      toStatus: "cancelled",
      actorId: me.id,
      reason: why.trim().slice(0, 300),
    });
    await notify(tx, orderId, "cancelled", me.id);
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
