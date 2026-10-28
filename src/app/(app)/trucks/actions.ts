"use server";

import { revalidatePath } from "next/cache";
import { isUuid } from "@/lib/ids";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { saveTruck, switchTruck, type TruckResult } from "@/lib/trucks";

function refresh() {
  revalidatePath("/trucks");
  revalidatePath("/dispatch");
  revalidatePath("/stock");
}

export async function addTruck(form: {
  number: string;
  driverName: string;
  driverPhone?: string;
}): Promise<TruckResult> {
  const session = await requireRole(...rolesFor("dispatch"));
  const res = await saveTruck(form, session.user.id);
  if (res.ok) refresh();
  return res;
}

export async function setTruckActive(id: string, active: boolean): Promise<TruckResult> {
  const session = await requireRole(...rolesFor("dispatch"));
  if (!isUuid(id) || typeof active !== "boolean") return { ok: false, error: "Truck not found" };
  const res = await switchTruck(id, active, session.user.id);
  if (res.ok) refresh();
  return res;
}
