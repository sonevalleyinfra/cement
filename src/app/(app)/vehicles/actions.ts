"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { vehicles } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { changedFields } from "@/lib/audit-rules";
import { isUuid } from "@/lib/ids";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { validateVehicle } from "@/lib/vehicle-rules";

export type VehicleResult = { ok: true } | { ok: false; error: string };

/** Adds a vehicle (id null) or edits one. Admin and logistics only. */
export async function saveVehicle(
  id: string | null,
  form: { number: string; driverName: string; driverPhone: string },
): Promise<VehicleResult> {
  const session = await requireRole(...rolesFor("editVehicles"));
  if (id !== null && !isUuid(id)) return { ok: false, error: "Vehicle not found." };
  const check = validateVehicle(form);
  if (!check.ok) return { ok: false, error: Object.values(check.errors)[0] ?? "Check the form" };
  const { number, driverName, driverPhone } = check.value;

  const clash = await db
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(id ? and(eq(vehicles.number, number), ne(vehicles.id, id)) : eq(vehicles.number, number))
    .limit(1);
  if (clash.length > 0) return { ok: false, error: "Vehicle already added" };

  const actorId = session.user.id;
  if (id) {
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(vehicles).where(eq(vehicles.id, id)).limit(1);
      await tx.update(vehicles).set({ number, driverName, driverPhone, updatedAt: new Date() }).where(eq(vehicles.id, id));
      const diff = changedFields(before, { number, driverName, driverPhone });
      if (diff) await writeAudit(tx, { actorId, entity: "vehicle", entityId: id, action: "update", details: diff });
    });
  } else {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(vehicles)
        .values({ number, driverName, driverPhone })
        .returning({ id: vehicles.id });
      await writeAudit(tx, {
        actorId,
        entity: "vehicle",
        entityId: row.id,
        action: "create",
        details: { number, driverName, driverPhone },
      });
    });
  }
  revalidatePath("/vehicles");
  return { ok: true };
}

/** Switches a vehicle on or off. Admin and logistics only. */
export async function setVehicleActive(id: string, active: boolean): Promise<VehicleResult> {
  const session = await requireRole(...rolesFor("editVehicles"));
  if (!isUuid(id)) return { ok: false, error: "Vehicle not found." };
  await db.transaction(async (tx) => {
    const done = await tx
      .update(vehicles)
      .set({ active, updatedAt: new Date() })
      .where(eq(vehicles.id, id))
      .returning({ id: vehicles.id });
    if (done.length > 0) {
      await writeAudit(tx, {
        actorId: session.user.id,
        entity: "vehicle",
        entityId: id,
        action: active ? "activate" : "deactivate",
      });
    }
  });
  revalidatePath("/vehicles");
  return { ok: true };
}
