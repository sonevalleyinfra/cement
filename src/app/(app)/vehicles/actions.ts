"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { vehicles } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { validateVehicle } from "@/lib/vehicle-rules";

export type VehicleResult = { ok: true } | { ok: false; error: string };

/** Adds a vehicle (id null) or edits one. Admin and logistics only. */
export async function saveVehicle(
  id: string | null,
  form: { number: string; driverName: string; driverPhone: string },
): Promise<VehicleResult> {
  await requireRole("logistics");
  const check = validateVehicle(form);
  if (!check.ok) return { ok: false, error: Object.values(check.errors)[0] ?? "Check the form" };
  const { number, driverName, driverPhone } = check.value;

  const clash = await db
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(id ? and(eq(vehicles.number, number), ne(vehicles.id, id)) : eq(vehicles.number, number))
    .limit(1);
  if (clash.length > 0) return { ok: false, error: "Vehicle already added" };

  if (id) {
    await db.update(vehicles).set({ number, driverName, driverPhone, updatedAt: new Date() }).where(eq(vehicles.id, id));
  } else {
    await db.insert(vehicles).values({ number, driverName, driverPhone });
  }
  revalidatePath("/vehicles");
  return { ok: true };
}

/** Switches a vehicle on or off. Admin and logistics only. */
export async function setVehicleActive(id: string, active: boolean): Promise<VehicleResult> {
  await requireRole("logistics");
  await db.update(vehicles).set({ active, updatedAt: new Date() }).where(eq(vehicles.id, id));
  revalidatePath("/vehicles");
  return { ok: true };
}
