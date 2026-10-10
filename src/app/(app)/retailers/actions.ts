"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { orders, retailers, user } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { changedFields } from "@/lib/audit-rules";
import { isUniqueViolation } from "@/lib/db-errors";
import { isUuid } from "@/lib/ids";
import { can, rolesFor } from "@/lib/permissions";
import { ORDER_STATUSES } from "@/lib/order-rules";
import { normalizePhone, planShopEdit, type ShopEditForm, validateRetailer } from "@/lib/retailer-rules";
import { checkSalesRepPick, movesWithSalesRep } from "@/lib/sales-rep-rules";
import { requireRole } from "@/lib/session";

export type RetailerResult = { ok: true } | { ok: false; error: string };

/**
 * Admin saves the shop sheet: name, phone, place, its sales person and its login, all or nothing
 * (rules in planShopEdit). One transaction, with the shop row locked so two saves cannot interleave.
 * A new sales person also takes over the shop's unfinished orders (sales-rep-rules.ts).
 * Each part that changed writes its own activity row, inside the same transaction.
 */
export async function saveShop(id: string, form: ShopEditForm): Promise<RetailerResult> {
  const session = await requireRole(...rolesFor("editRetailers"));
  const me = session.user;
  if (!isUuid(id)) return { ok: false, error: "Retailer not found." };
  const input: ShopEditForm = {
    name: String(form?.name ?? ""),
    phone: String(form?.phone ?? ""),
    place: String(form?.place ?? ""),
    salesRepId: typeof form?.salesRepId === "string" ? form.salesRepId : undefined,
    userId: typeof form?.userId === "string" || form?.userId === null ? form.userId : undefined,
  };
  if (input.salesRepId !== undefined && !can(me.role, "assignSalesRep")) return { ok: false, error: "Only admin can do this." };
  if (input.userId !== undefined && !can(me.role, "linkRetailerLogin")) return { ok: false, error: "Only admin can do this." };

  let changedRep = false;
  try {
    const res = await db.transaction(async (tx): Promise<RetailerResult> => {
      const [before] = await tx.select().from(retailers).where(eq(retailers.id, id)).for("no key update");
      if (!before) return { ok: false, error: "Retailer not found." };
      const phone = normalizePhone(input.phone);
      const clash = await tx
        .select({ id: retailers.id })
        .from(retailers)
        .where(and(eq(retailers.phone, phone), ne(retailers.id, id)))
        .limit(1);
      const [salesRep] =
        input.salesRepId && input.salesRepId !== before.salesRepId
          ? await tx
              .select({ id: user.id, role: user.role, banned: user.banned, deletedAt: user.deletedAt })
              .from(user)
              .where(eq(user.id, input.salesRepId))
              .limit(1)
          : [];
      const [login] = input.userId
        ? await tx.select({ id: user.id, role: user.role }).from(user).where(eq(user.id, input.userId)).limit(1)
        : [];
      const loginLinks = input.userId
        ? await tx
            .select({ retailerId: retailers.id, userId: retailers.userId })
            .from(retailers)
            .where(eq(retailers.userId, input.userId))
        : [];
      const plan = planShopEdit(before, input, { phoneTaken: clash.length > 0, salesRep, login, loginLinks });
      if (!plan.ok) return plan;

      const now = new Date();
      await tx
        .update(retailers)
        .set({
          ...plan.details,
          ...(plan.salesRepId ? { salesRepId: plan.salesRepId } : {}),
          ...(plan.userId !== undefined ? { userId: plan.userId } : {}),
          updatedAt: now,
        })
        .where(eq(retailers.id, id));
      const diff = changedFields(before, plan.details);
      if (diff) await writeAudit(tx, { actorId: me.id, entity: "retailer", entityId: id, action: "update", details: diff });
      if (plan.salesRepId) {
        changedRep = true;
        const moved = await tx
          .update(orders)
          .set({ salesRepId: plan.salesRepId, updatedAt: now })
          .where(and(eq(orders.retailerId, id), inArray(orders.status, ORDER_STATUSES.filter(movesWithSalesRep))))
          .returning({ id: orders.id });
        await writeAudit(tx, {
          actorId: me.id,
          entity: "retailer",
          entityId: id,
          action: "assign_sales_rep",
          details: { salesRepId: { before: before.salesRepId, after: plan.salesRepId }, ordersMoved: moved.length },
        });
      }
      if (plan.userId !== undefined) {
        await writeAudit(tx, {
          actorId: me.id,
          entity: "retailer",
          entityId: id,
          action: "link",
          details: { before: { userId: before.userId }, after: { userId: plan.userId } },
        });
      }
      return { ok: true };
    });
    if (!res.ok) return res;
  } catch (e) {
    // Two saves at the same moment: the database keeps phones and logins unique (nothing was saved).
    if (isUniqueViolation(e, "retailers_phone_unique")) return { ok: false, error: "Phone already used" };
    if (isUniqueViolation(e, "retailers_user_id_unique")) {
      return { ok: false, error: "That login is already linked to another retailer." };
    }
    throw e;
  }
  revalidatePath("/retailers");
  revalidatePath("/dashboard");
  if (changedRep) revalidatePath("/orders");
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
