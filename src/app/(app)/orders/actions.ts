"use server";

import { and, asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { orderEvents, orders, products, retailers, user, userFirms } from "@/db/schema";
import {
  isBagsInRange,
  resolveOrderRetailer,
  validatePlaceOrder,
} from "@/lib/order-access";
import { pickNextAssignee } from "@/lib/order-rules";
import { hasRole } from "@/lib/roles";
import { canDecide, canFillRate, checkRejectReason, ratePaiseFromRupeeDigits } from "@/lib/rate-rules";
import { notify } from "@/lib/notify";
import { requireFirm, requireRole } from "@/lib/session";

export type PlaceOrderResult = { ok: true } | { ok: false; error: string };

/** Places an order for one firm. Sales, retailer and admin only. */
export async function placeOrder(input: {
  firmId: string | null;
  retailerId: string | null;
  productId: string | null;
  bags: number;
  notes?: string;
}): Promise<PlaceOrderResult> {
  const session = await requireRole("sales", "retailer");
  const check = validatePlaceOrder({
    readOnlyMode: !input.firmId,
    bags: input.bags,
    retailerId: input.retailerId,
    productId: input.productId,
  });
  if (!check.ok) return check;
  if (!isBagsInRange(input.bags)) return { ok: false, error: "That is too many bags." };

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
        notes: (input.notes ?? "").trim().slice(0, 500),
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
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  return order ?? null;
}

/** Sales (the assigned rep) or admin enters the rate per bag (whole rupees). Moves to pending approval. */
export async function fillRate(orderId: string, rupeeDigits: string): Promise<PlaceOrderResult> {
  const session = await requireRole("sales");
  const order = await loadOrder(orderId);
  if (!order) return { ok: false, error: "Order not found." };
  await requireFirm(order.firmId);
  const me = session.user;
  if (!canFillRate(me.role, me.id, order.salesRepId, order.status)) {
    return { ok: false, error: "You cannot fill the rate on this order." };
  }
  const ratePaise = ratePaiseFromRupeeDigits(rupeeDigits);
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
  const session = await requireRole("accounts");
  const order = await loadOrder(orderId);
  if (!order) return { ok: false, error: "Order not found." };
  await requireFirm(order.firmId);
  if (!canDecide(session.user.role, order.status, decision)) {
    return { ok: false, error: "This order is not waiting for approval." };
  }
  let why = "";
  if (decision === "rejected") {
    const check = checkRejectReason(reason);
    if (!check.ok) return check;
    why = check.reason;
  }
  const ok = await moveOrder(order.id, "rate_filled", decision, session.user.id, why);
  return ok ? { ok: true } : { ok: false, error: "This order was just changed. Refresh." };
}
