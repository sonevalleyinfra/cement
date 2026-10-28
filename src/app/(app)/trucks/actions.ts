"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { vehicles } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { rolesFor } from "@/lib/permissions";
import { saveTruck, type TruckResult } from "@/lib/trucks";

export async function addTruck(form: {
  number: string;
  driverName: string;
  driverPhone?: string;
}): Promise<TruckResult> {
  const session = await requireRole(...rolesFor("dispatch"));
  const res = await saveTruck(form, session.user.id);
  if (res.ok) {
    revalidatePath("/trucks");
    revalidatePath("/dispatch");
    revalidatePath("/stock");
  }
  return res;
}

export async function setTruckActive(id: string, active: boolean): Promise<TruckResult> {
  await requireRole(...rolesFor("dispatch"));
  await db.update(vehicles).set({ active, updatedAt: new Date() }).where(eq(vehicles.id, id));
  revalidatePath("/trucks");
  revalidatePath("/dispatch");
  revalidatePath("/stock");
  return { ok: true };
}
