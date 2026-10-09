"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { firms, userFirms } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { changedFields } from "@/lib/audit-rules";
import { getOpenBusiness } from "@/lib/firm-open-business";
import {
  checkRemoveFirm,
  isDuplicateFirmName,
  openBusinessProblem,
  pickFirmSlot,
  usersForNewFirm,
  validateFirm,
} from "@/lib/firm-rules";
import { isUuid } from "@/lib/ids";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";

export type FirmResult = { ok: true } | { ok: false; error: string };

type FirmForm = { name: string; ownerName: string; phone: string; gstin: string; address: string };

/**
 * Adds a firm (id null) or edits one. Admin only.
 * A new firm gets the next free colour, and everyone who already works on any
 * active firm (every role) is given access to it.
 */
export async function saveFirm(id: string | null, form: FirmForm): Promise<FirmResult> {
  const session = await requireRole(...rolesFor("manageFirms"));
  if (id !== null && !isUuid(id)) return { ok: false, error: "Firm not found." };
  const check = validateFirm(form);
  if (!check.ok) return { ok: false, error: Object.values(check.errors)[0] ?? "Check the form" };
  const details = check.value;

  const actorId = session.user.id;
  const all = await db.select({ id: firms.id, name: firms.name }).from(firms);
  if (id && !all.some((f) => f.id === id)) return { ok: false, error: "Firm not found." };
  if (isDuplicateFirmName(details.name, all, id ?? undefined)) return { ok: false, error: "Firm name already used" };

  if (id) {
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(firms).where(eq(firms.id, id)).limit(1);
      await tx.update(firms).set({ ...details, updatedAt: new Date() }).where(eq(firms.id, id));
      const diff = changedFields(before, details);
      if (diff) await writeAudit(tx, { actorId, entity: "firm", entityId: id, action: "update", details: diff });
    });
  } else {
    // The firm and its staff access are added together, or not at all.
    await db.transaction(async (tx) => {
      const active = await tx.select({ id: firms.id, slot: firms.slot }).from(firms).where(eq(firms.active, true));
      const links = await tx.select({ userId: userFirms.userId, firmId: userFirms.firmId }).from(userFirms);
      const [created] = await tx
        .insert(firms)
        .values({ ...details, slot: pickFirmSlot(active.map((f) => f.slot)) })
        .returning({ id: firms.id });
      const userIds = usersForNewFirm(links, active.map((f) => f.id));
      if (userIds.length > 0) {
        await tx
          .insert(userFirms)
          .values(userIds.map((userId) => ({ userId, firmId: created.id })))
          .onConflictDoNothing();
      }
      await writeAudit(tx, {
        actorId,
        entity: "firm",
        entityId: created.id,
        action: "create",
        details: { ...details, accessGivenTo: userIds.length },
      });
    });
  }
  // Firm names show in the header switcher on every screen.
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Removes a firm (hides it everywhere, keeps all its records) or brings it back. Admin only.
 * The last active firm cannot be removed. A restored firm gets a free colour again.
 */
export async function setFirmActive(id: string, active: boolean): Promise<FirmResult> {
  const session = await requireRole(...rolesFor("manageFirms"));
  if (!isUuid(id)) return { ok: false, error: "Firm not found." };
  const rows = await db.select({ id: firms.id, slot: firms.slot, active: firms.active }).from(firms);
  const target = rows.find((f) => f.id === id);
  if (!target) return { ok: false, error: "Firm not found." };
  const live = rows.filter((f) => f.active);

  if (active) {
    if (target.active) return { ok: true };
    const slot = pickFirmSlot(live.map((f) => f.slot));
    await db.transaction(async (tx) => {
      await tx.update(firms).set({ active: true, slot, updatedAt: new Date() }).where(eq(firms.id, id));
      await writeAudit(tx, { actorId: session.user.id, entity: "firm", entityId: id, action: "activate" });
    });
  } else {
    const problem = checkRemoveFirm(live.map((f) => f.id), id);
    if (problem) return { ok: false, error: problem };
    // Do not hide a firm that still has bags, balances, cash, orders or payments open.
    const open = openBusinessProblem(await getOpenBusiness(id));
    if (open) return { ok: false, error: open };
    await db.transaction(async (tx) => {
      await tx.update(firms).set({ active: false, updatedAt: new Date() }).where(eq(firms.id, id));
      await writeAudit(tx, { actorId: session.user.id, entity: "firm", entityId: id, action: "deactivate" });
    });
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
