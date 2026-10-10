"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { orders, retailers, user } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { changedFields } from "@/lib/audit-rules";
import { isUniqueViolation } from "@/lib/db-errors";
import { isUuid } from "@/lib/ids";
import { rolesFor } from "@/lib/permissions";
import { canLinkRetailerUser } from "@/lib/rate-rules";
import { hasRole } from "@/lib/roles";
import { ORDER_STATUSES } from "@/lib/order-rules";
import { validateRetailer } from "@/lib/retailer-rules";
import { checkSalesRepPick, movesWithSalesRep } from "@/lib/sales-rep-rules";
import { requireRole } from "@/lib/session";

export type RetailerResult = { ok: true } | { ok: false; error: string };

/** Edits a retailer's name, phone and place. Admin only. */
export async function saveRetailer(
  id: string,
  form: { name: string; phone: string; place: string },
): Promise<RetailerResult> {
  const session = await requireRole(...rolesFor("editRetailers"));
  if (!isUuid(id)) return { ok: false, error: "Retailer not found." };
  const check = validateRetailer(form);
  if (!check.ok) return { ok: false, error: Object.values(check.errors)[0] ?? "Check the form" };
  const { name, phone, place } = check.value;

  const clash = await db
    .select({ id: retailers.id })
    .from(retailers)
    .where(and(eq(retailers.phone, phone), ne(retailers.id, id)))
    .limit(1);
  if (clash.length > 0) return { ok: false, error: "Phone already used" };

  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(retailers).where(eq(retailers.id, id)).limit(1);
    await tx.update(retailers).set({ name, phone, place, updatedAt: new Date() }).where(eq(retailers.id, id));
    const diff = changedFields(before, { name, phone, place });
    if (diff) await writeAudit(tx, { actorId: session.user.id, entity: "retailer", entityId: id, action: "update", details: diff });
  });
  revalidatePath("/retailers");
  return { ok: true };
}

/** The sales person admin picked, checked: an active sales person (required). */
async function checkPickedSalesRep(salesRepId: unknown): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const id = typeof salesRepId === "string" && salesRepId ? salesRepId : null;
  const [person] = id
    ? await db
        .select({ id: user.id, role: user.role, banned: user.banned, deletedAt: user.deletedAt })
        .from(user)
        .where(eq(user.id, id))
        .limit(1)
    : [];
  const check = checkSalesRepPick(id, person);
  return check.ok && id ? { ok: true, id } : { ok: false, error: check.ok ? "Pick a sales person." : check.error };
}

/**
 * Admin adds a shop: name, phone, place and its sales person (required). No login is needed;
 * linking a retailer login is a separate, optional step (linkRetailerUser).
 */
export async function addRetailer(form: {
  name: string;
  phone: string;
  place: string;
  salesRepId: string;
}): Promise<RetailerResult> {
  const session = await requireRole(...rolesFor("editRetailers"));
  const check = validateRetailer(form ?? {});
  if (!check.ok) return { ok: false, error: Object.values(check.errors)[0] ?? "Check the form" };
  const rep = await checkPickedSalesRep(form?.salesRepId);
  if (!rep.ok) return rep;
  const { name, phone, place } = check.value;
  const clash = await db.select({ id: retailers.id }).from(retailers).where(eq(retailers.phone, phone)).limit(1);
  if (clash.length > 0) return { ok: false, error: "Phone already used" };

  try {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(retailers)
        .values({ name, phone, place, salesRepId: rep.id })
        .returning({ id: retailers.id });
      await writeAudit(tx, {
        actorId: session.user.id,
        entity: "retailer",
        entityId: row.id,
        action: "create",
        details: { name, phone, place, salesRepId: rep.id },
      });
    });
  } catch (e) {
    // Two adds of the same phone at the same moment: the database keeps phones unique.
    if (isUniqueViolation(e, "retailers_phone_unique")) return { ok: false, error: "Phone already used" };
    throw e;
  }
  revalidatePath("/retailers");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Switches a retailer on or off. Admin only. */
export async function setRetailerActive(id: string, active: boolean): Promise<RetailerResult> {
  const session = await requireRole(...rolesFor("editRetailers"));
  if (!isUuid(id)) return { ok: false, error: "Retailer not found." };
  await db.transaction(async (tx) => {
    const done = await tx
      .update(retailers)
      .set({ active, updatedAt: new Date() })
      .where(eq(retailers.id, id))
      .returning({ id: retailers.id });
    if (done.length > 0) {
      await writeAudit(tx, {
        actorId: session.user.id,
        entity: "retailer",
        entityId: id,
        action: active ? "activate" : "deactivate",
      });
    }
  });
  revalidatePath("/retailers");
  return { ok: true };
}

/** Admin links a retailer to a login (a user with the retailer role), or unlinks with null. */
export async function linkRetailerUser(
  retailerId: string,
  userId: string | null,
): Promise<RetailerResult> {
  const session = await requireRole(...rolesFor("linkRetailerLogin"));
  if (!isUuid(retailerId)) return { ok: false, error: "Retailer not found." };
  if (userId) {
    const [u] = await db.select({ role: user.role }).from(user).where(eq(user.id, userId)).limit(1);
    if (!u || !hasRole(u.role, "retailer")) return { ok: false, error: "Pick a user with the retailer role." };
    const links = await db
      .select({ retailerId: retailers.id, userId: retailers.userId })
      .from(retailers)
      .where(eq(retailers.userId, userId));
    const check = canLinkRetailerUser(userId, retailerId, links);
    if (!check.ok) return check;
  }
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ userId: retailers.userId })
      .from(retailers)
      .where(eq(retailers.id, retailerId))
      .limit(1);
    await tx.update(retailers).set({ userId, updatedAt: new Date() }).where(eq(retailers.id, retailerId));
    await writeAudit(tx, {
      actorId: session.user.id,
      entity: "retailer",
      entityId: retailerId,
      action: "link",
      details: { before: { userId: before?.userId ?? null }, after: { userId } },
    });
  });
  revalidatePath("/retailers");
  return { ok: true };
}

/**
 * Admin picks (or changes) the sales person who looks after a retailer (one is required).
 * The shop's unfinished orders move to the new sales person too (sales-rep-rules.ts).
 */
export async function setRetailerSalesRep(retailerId: string, pickedId: string): Promise<RetailerResult> {
  const session = await requireRole(...rolesFor("assignSalesRep"));
  if (!isUuid(retailerId)) return { ok: false, error: "Retailer not found." };
  const rep = await checkPickedSalesRep(pickedId);
  if (!rep.ok) return rep;
  const salesRepId = rep.id;

  const res = await db.transaction(async (tx): Promise<RetailerResult> => {
    // Lock the shop so two quick changes cannot interleave.
    const [before] = await tx
      .select({ salesRepId: retailers.salesRepId })
      .from(retailers)
      .where(eq(retailers.id, retailerId))
      .for("no key update");
    if (!before) return { ok: false, error: "Retailer not found." };
    if (before.salesRepId === salesRepId) return { ok: true };
    await tx.update(retailers).set({ salesRepId, updatedAt: new Date() }).where(eq(retailers.id, retailerId));
    const moved = await tx
      .update(orders)
      .set({ salesRepId, updatedAt: new Date() })
      .where(and(eq(orders.retailerId, retailerId), inArray(orders.status, ORDER_STATUSES.filter(movesWithSalesRep))))
      .returning({ id: orders.id });
    await writeAudit(tx, {
      actorId: session.user.id,
      entity: "retailer",
      entityId: retailerId,
      action: "assign_sales_rep",
      details: { salesRepId: { before: before.salesRepId, after: salesRepId }, ordersMoved: moved.length },
    });
    return { ok: true };
  });
  if (res.ok) {
    revalidatePath("/retailers");
    revalidatePath("/orders");
    revalidatePath("/dashboard");
  }
  return res;
}
