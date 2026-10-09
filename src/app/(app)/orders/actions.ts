"use server";

import { asc, desc, eq } from "drizzle-orm";
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
  });
  revalidatePath("/orders");
  return { ok: true };
}
