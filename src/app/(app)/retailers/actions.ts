"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { retailers, user } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { changedFields } from "@/lib/audit-rules";
import { isUuid } from "@/lib/ids";
import { rolesFor } from "@/lib/permissions";
import { canLinkRetailerUser } from "@/lib/rate-rules";
import { hasRole } from "@/lib/roles";
import { validateRetailer } from "@/lib/retailer-rules";
import { requireRole } from "@/lib/session";

export type RetailerResult = { ok: true } | { ok: false; error: string };

/** Adds a retailer (id empty) or edits one. Admin and sales only. */
export async function saveRetailer(
  id: string | null,
  form: { name: string; phone: string; place: string },
): Promise<RetailerResult> {
  const session = await requireRole(...rolesFor("editRetailers"));
  if (id !== null && !isUuid(id)) return { ok: false, error: "Retailer not found." };
  const check = validateRetailer(form);
  if (!check.ok) return { ok: false, error: Object.values(check.errors)[0] ?? "Check the form" };
  const { name, phone, place } = check.value;

  const clash = await db
    .select({ id: retailers.id })
    .from(retailers)
    .where(id ? and(eq(retailers.phone, phone), ne(retailers.id, id)) : eq(retailers.phone, phone))
    .limit(1);
  if (clash.length > 0) return { ok: false, error: "Phone already used" };

  const actorId = session.user.id;
  if (id) {
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(retailers).where(eq(retailers.id, id)).limit(1);
      await tx.update(retailers).set({ name, phone, place, updatedAt: new Date() }).where(eq(retailers.id, id));
      const diff = changedFields(before, { name, phone, place });
      if (diff) await writeAudit(tx, { actorId, entity: "retailer", entityId: id, action: "update", details: diff });
    });
  } else {
    await db.transaction(async (tx) => {
      const [row] = await tx.insert(retailers).values({ name, phone, place }).returning({ id: retailers.id });
      await writeAudit(tx, {
        actorId,
        entity: "retailer",
        entityId: row.id,
        action: "create",
        details: { name, phone, place },
      });
    });
  }
  revalidatePath("/retailers");
  return { ok: true };
}

/** Switches a retailer on or off. Admin and sales only. */
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
