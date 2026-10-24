"use server";

import { eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { areas } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { changedFields } from "@/lib/audit-rules";
import { isDuplicateName } from "@/lib/catalogue-rules";
import { isUuid } from "@/lib/ids";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { cleanAreaName } from "@/lib/shop-master-rules";

export type AreaResult = { ok: true } | { ok: false; error: string };

function done(): AreaResult {
  revalidatePath("/areas");
  revalidatePath("/retailers");
  return { ok: true };
}

/** Adds an area (id null) or renames it. Admin only. */
export async function saveArea(id: string | null, form: { name: string }): Promise<AreaResult> {
  const session = await requireRole(...rolesFor("editRetailers"));
  if (id !== null && !isUuid(id)) return { ok: false, error: "Area not found." };
  const name = cleanAreaName(String(form?.name ?? ""));
  if (!name) return { ok: false, error: "Enter an area name." };
  const actorId = session.user.id;
  const res = await db.transaction(async (tx): Promise<AreaResult> => {
    // One add or rename at a time, so two admins cannot make the same name.
    await tx.execute(sql`lock table ${areas} in share row exclusive mode`);
    const others = await tx
      .select({ name: areas.name })
      .from(areas)
      .where(id ? ne(areas.id, id) : undefined);
    if (isDuplicateName(name, others.map((o) => o.name))) return { ok: false, error: "Area already added." };
    if (id) {
      const [before] = await tx.select().from(areas).where(eq(areas.id, id)).limit(1);
      if (!before) return { ok: false, error: "Area not found." };
      await tx.update(areas).set({ name, updatedAt: new Date() }).where(eq(areas.id, id));
      const diff = changedFields(before, { name });
      if (diff) await writeAudit(tx, { actorId, entity: "area", entityId: id, action: "update", details: diff });
    } else {
      const [row] = await tx.insert(areas).values({ name }).returning({ id: areas.id });
      await writeAudit(tx, { actorId, entity: "area", entityId: row.id, action: "create", details: { name } });
    }
    return { ok: true };
  });
  return res.ok ? done() : res;
}

/** Switches an area on or off. Off is allowed while shops use it: they keep it, it just cannot be picked again. */
export async function setAreaActive(id: string, active: boolean): Promise<AreaResult> {
  const session = await requireRole(...rolesFor("editRetailers"));
  if (!isUuid(id)) return { ok: false, error: "Area not found." };
  const res = await db.transaction(async (tx): Promise<AreaResult> => {
    const [row] = await tx.select().from(areas).where(eq(areas.id, id)).for("update");
    if (!row) return { ok: false, error: "Area not found." };
    await tx.update(areas).set({ active, updatedAt: new Date() }).where(eq(areas.id, id));
    await writeAudit(tx, {
      actorId: session.user.id,
      entity: "area",
      entityId: id,
      action: active ? "activate" : "deactivate",
      details: { name: row.name },
    });
    return { ok: true };
  });
  return res.ok ? done() : res;
}
