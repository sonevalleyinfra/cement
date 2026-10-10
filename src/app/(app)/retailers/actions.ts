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
import { checkRetailerPick, validateRetailer } from "@/lib/retailer-rules";
import { requireRole } from "@/lib/session";

export type RetailerResult = { ok: true } | { ok: false; error: string };

/** Edits a retailer's name, phone and place. Admin and sales only. */
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

/**
 * Adds a retailer picked from the logins the admin created (retailer role).
 * Name and phone come from that login, and the shop is linked to it. Admin and sales only.
 */
export async function addRetailerFromLogin(userId: string, place: string): Promise<RetailerResult> {
  const session = await requireRole(...rolesFor("editRetailers"));
  if (typeof userId !== "string" || typeof place !== "string") return { ok: false, error: "Check the form" };
  const [login] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      banned: user.banned,
      deletedAt: user.deletedAt,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  const linked = await db
    .select({ userId: retailers.userId })
    .from(retailers)
    .where(eq(retailers.userId, userId));
  const check = checkRetailerPick(login, linked.map((l) => l.userId));
  if (!check.ok) return check;

  const clash = await db.select({ id: retailers.id }).from(retailers).where(eq(retailers.phone, login.phone)).limit(1);
  if (clash.length > 0) return { ok: false, error: "A retailer with this phone already exists." };

  const name = login.name.trim();
  const cleanPlace = place.trim();
  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(retailers)
      .values({ name, phone: login.phone, place: cleanPlace, userId: login.id })
      .returning({ id: retailers.id });
    await writeAudit(tx, {
      actorId: session.user.id,
      entity: "retailer",
      entityId: row.id,
      action: "create",
      details: { name, phone: login.phone, place: cleanPlace, userId: login.id },
    });
  });
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
