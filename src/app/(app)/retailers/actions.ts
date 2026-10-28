"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { areas, creditLimitChanges, orders, retailers, user } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { changedFields } from "@/lib/audit-rules";
import type { CreditForm } from "@/lib/credit-rules";
import { toISTDateKey } from "@/lib/datetime";
import { isUniqueViolation } from "@/lib/db-errors";
import { isUuid } from "@/lib/ids";
import { getBalance } from "@/lib/ledger";
import { duesFrom } from "@/lib/ledger-rules";
import { can, rolesFor } from "@/lib/permissions";
import { ORDER_STATUSES } from "@/lib/order-rules";
import { normalizePhone, planShopEdit, type ShopEditForm, validateRetailer } from "@/lib/retailer-rules";
import { checkSalesRepPick, movesWithSalesRep } from "@/lib/sales-rep-rules";
import { geoCapturedAt, type ShopMasterForm } from "@/lib/shop-master-rules";
import { requireRole } from "@/lib/session";
import { planShopSwitch } from "@/lib/shop-off-rules";

export type RetailerResult = { ok: true } | { ok: false; error: string };

/** Server actions are public: anything may arrive. Text fields become strings, numbers stay numbers. */
const text = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const num = (v: unknown) => (typeof v === "number" ? v : null);

function masterInput(m: unknown): ShopMasterForm | undefined {
  if (!m || typeof m !== "object") return undefined;
  const r = m as Record<string, unknown>;
  return {
    ownerName: text(r.ownerName),
    altPhone: text(r.altPhone),
    address: text(r.address),
    areaId: text(r.areaId),
    pincode: text(r.pincode),
    lat: num(r.lat),
    lng: num(r.lng),
    category: text(r.category),
    openedOn: text(r.openedOn),
    gstin: text(r.gstin),
  };
}

function creditInput(c: unknown): CreditForm | undefined {
  if (!c || typeof c !== "object") return undefined;
  const r = c as Record<string, unknown>;
  return { limit: text(r.limit), days: text(r.days), status: text(r.status), note: text(r.note) };
}

/**
 * Admin saves the shop sheet: name, phone, place, its sales person, its login, the master fields
 * and the credit terms, all or nothing (rules in planShopEdit). One transaction, with the shop row locked so two saves cannot interleave.
 * A new sales person also takes over the shop's unfinished orders (sales-rep-rules.ts) and its dues
 * (the activity row keeps how much was owed then).
 * Each part that changed writes its own activity row, inside the same transaction. Changed credit
 * terms also add one row to the credit history (credit_limit_changes).
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
    master: masterInput(form?.master),
    credit: creditInput(form?.credit),
  };
  if (input.salesRepId !== undefined && !can(me.role, "assignSalesRep")) return { ok: false, error: "Only admin can do this." };
  if (input.userId !== undefined && !can(me.role, "linkRetailerLogin")) return { ok: false, error: "Only admin can do this." };
  if (input.credit !== undefined && !can(me.role, "editCredit")) return { ok: false, error: "Only admin can do this." };
  if (input.master?.areaId && !isUuid(input.master.areaId)) return { ok: false, error: "Pick an active area" };

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
      // The new sales person's row is locked (after the shop: lock order), so they cannot be
      // deactivated while this save gives them the shop.
      const [salesRep] =
        input.salesRepId && input.salesRepId !== before.salesRepId
          ? await tx
              .select({ id: user.id, role: user.role, banned: user.banned, deletedAt: user.deletedAt })
              .from(user)
              .where(eq(user.id, input.salesRepId))
              .for("share")
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
      const pickedArea = input.master?.areaId || null;
      const [area] =
        pickedArea && pickedArea !== before.areaId
          ? await tx.select({ id: areas.id, active: areas.active }).from(areas).where(eq(areas.id, pickedArea)).for("share")
          : [];
      const plan = planShopEdit(before, input, {
        phoneTaken: clash.length > 0,
        salesRep,
        login,
        loginLinks,
        area,
        today: toISTDateKey(new Date()),
      });
      if (!plan.ok) return plan;

      const now = new Date();
      const credit = plan.credit
        ? {
            creditLimitPaise: plan.credit.terms.limitPaise,
            creditDays: plan.credit.terms.creditDays,
            creditStatus: plan.credit.terms.status,
          }
        : {};
      const fields = { ...plan.details, ...(plan.master ?? {}), ...credit };
      const pinnedAt = plan.master ? geoCapturedAt(before, plan.master, now) : undefined;
      await tx
        .update(retailers)
        .set({
          ...fields,
          ...(pinnedAt !== undefined ? { geoCapturedAt: pinnedAt } : {}),
          ...(plan.salesRepId ? { salesRepId: plan.salesRepId } : {}),
          ...(plan.userId !== undefined ? { userId: plan.userId } : {}),
          updatedAt: now,
        })
        .where(eq(retailers.id, id));
      const diff = changedFields(before, fields);
      if (diff) await writeAudit(tx, { actorId: me.id, entity: "retailer", entityId: id, action: "update", details: diff });
      const change = plan.credit?.change;
      if (change) {
        await tx.insert(creditLimitChanges).values({ retailerId: id, changedBy: me.id, ...change, createdAt: now });
        await writeAudit(tx, {
          actorId: me.id,
          entity: "retailer",
          entityId: id,
          action: "credit_change",
          details: {
            before: { limitPaise: change.oldLimitPaise, creditDays: change.oldCreditDays, status: change.oldStatus },
            after: { limitPaise: change.newLimitPaise, creditDays: change.newCreditDays, status: change.newStatus },
            ...(change.note ? { note: change.note } : {}),
          },
        });
      }
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
          details: {
            salesRepId: { before: before.salesRepId, after: plan.salesRepId },
            ordersMoved: moved.length,
            // The dues the new sales person now collects.
            duesPaise: duesFrom(await getBalance(id, tx)),
          },
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
  category?: string;
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
        .values({ name, phone, place, salesRepId: rep.id, category: form?.category && (form.category === "contractor" || form.category === "retailer") ? form.category : "retailer" })
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

/**
 * Switches a retailer on or off. Admin only. Turning off a shop that still owes needs a reason
 * (planShopSwitch): the shop keeps its dues and stays in the overdue list, the ledger and the
 * payment form. The shop row is locked, so a payment saved meanwhile is counted in the dues read.
 */
export async function setRetailerActive(
  id: string,
  active: boolean,
  reason?: { code?: unknown; note?: unknown },
): Promise<RetailerResult> {
  const session = await requireRole(...rolesFor("editRetailers"));
  if (!isUuid(id)) return { ok: false, error: "Retailer not found." };
  const makeActive = active === true;
  const res = await db.transaction(async (tx): Promise<RetailerResult> => {
    const [shop] = await tx.select({ id: retailers.id }).from(retailers).where(eq(retailers.id, id)).for("no key update");
    if (!shop) return { ok: false, error: "Retailer not found." };
    const duesPaise = duesFrom(await getBalance(id, tx));
    const r = reason && typeof reason === "object" ? reason : {};
    const plan = planShopSwitch({ makeActive, duesPaise, code: r.code, note: r.note });
    if (!plan.ok) return plan;
    await tx.update(retailers).set({ active: makeActive, updatedAt: new Date() }).where(eq(retailers.id, id));
    await writeAudit(tx, {
      actorId: session.user.id,
      entity: "retailer",
      entityId: id,
      action: makeActive ? "activate" : "deactivate",
      ...(makeActive
        ? {}
        : {
            details: {
              duesPaise,
              ...(plan.reason ? { reasonCode: plan.reason.code } : {}),
              ...(plan.reason?.note ? { note: plan.reason.note } : {}),
            },
          }),
    });
    return { ok: true };
  });
  if (!res.ok) return res;
  revalidatePath("/retailers");
  revalidatePath("/ledger");
  revalidatePath("/dashboard");
  return { ok: true };
}
