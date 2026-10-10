"use server";

import { eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { godowns, stockLocations } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { changedFields } from "@/lib/audit-rules";
import { isDuplicateName } from "@/lib/catalogue-rules";
import { isUuid } from "@/lib/ids";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { bagsAtPlace } from "@/lib/stock-places";
import { canSwitchOffPlace, cleanLocationName } from "@/lib/stock-rules";

export type GodownResult = { ok: true } | { ok: false; error: string };

function done(): GodownResult {
  revalidatePath("/godowns");
  revalidatePath("/stock");
  revalidatePath("/dispatch");
  return { ok: true };
}

/** Adds a godown (id null) or changes its name / address. Shared by all firms. Admin only. */
export async function saveGodown(id: string | null, form: { name: string; address: string }): Promise<GodownResult> {
  const session = await requireRole(...rolesFor("manageStock"));
  if (id !== null && !isUuid(id)) return { ok: false, error: "Godown not found." };
  const name = cleanLocationName(String(form.name ?? ""));
  if (!name) return { ok: false, error: "Enter a godown name." };
  const address = String(form.address ?? "").trim().replace(/\s+/g, " ").slice(0, 200);
  const actorId = session.user.id;
  const res = await db.transaction(async (tx): Promise<GodownResult> => {
    // One add or rename at a time, so two admins cannot make the same name.
    await tx.execute(sql`lock table ${godowns} in share row exclusive mode`);
    const others = await tx
      .select({ name: godowns.name })
      .from(godowns)
      .where(id ? ne(godowns.id, id) : undefined);
    if (isDuplicateName(name, others.map((o) => o.name))) return { ok: false, error: "Godown already added." };
    if (id) {
      const [before] = await tx.select().from(godowns).where(eq(godowns.id, id)).limit(1);
      if (!before) return { ok: false, error: "Godown not found." };
      await tx.update(godowns).set({ name, address, updatedAt: new Date() }).where(eq(godowns.id, id));
      // Keep the old name copy on each firm's row in step (screens read the godown's own name).
      await tx.update(stockLocations).set({ name }).where(eq(stockLocations.godownId, id));
      const diff = changedFields(before, { name, address });
      if (diff) await writeAudit(tx, { actorId, entity: "godown", entityId: id, action: "update", details: diff });
    } else {
      const [row] = await tx.insert(godowns).values({ name, address }).returning({ id: godowns.id });
      await writeAudit(tx, { actorId, entity: "godown", entityId: row.id, action: "create", details: { name, address } });
    }
    return { ok: true };
  });
  return res.ok ? done() : res;
}

/** Switches a godown on or off for all firms. Off is refused while any firm has bags there. */
export async function setGodownActive(id: string, active: boolean): Promise<GodownResult> {
  const session = await requireRole(...rolesFor("manageStock"));
  if (!isUuid(id)) return { ok: false, error: "Godown not found." };
  const res = await db.transaction(async (tx): Promise<GodownResult> => {
    // Stock entries share-lock the godown, so bags cannot arrive while we check.
    const [row] = await tx.select().from(godowns).where(eq(godowns.id, id)).for("update");
    if (!row) return { ok: false, error: "Godown not found." };
    if (!active) {
      const ok = canSwitchOffPlace(await bagsAtPlace(tx, { kind: "godown", id }));
      if (!ok.ok) return ok;
    }
    await tx.update(godowns).set({ active, updatedAt: new Date() }).where(eq(godowns.id, id));
    await writeAudit(tx, {
      actorId: session.user.id,
      entity: "godown",
      entityId: id,
      action: active ? "activate" : "deactivate",
      details: { name: row.name },
    });
    return { ok: true };
  });
  return res.ok ? done() : res;
}
