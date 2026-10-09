"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { retailers } from "@/db/schema";
import { validateRetailer } from "@/lib/retailer-rules";
import { requireRole } from "@/lib/session";

export type RetailerResult = { ok: true } | { ok: false; error: string };

/** Adds a retailer (id empty) or edits one. Admin and sales only. */
export async function saveRetailer(
  id: string | null,
  form: { name: string; phone: string; place: string },
): Promise<RetailerResult> {
  await requireRole("sales");
  const check = validateRetailer(form);
  if (!check.ok) return { ok: false, error: Object.values(check.errors)[0] ?? "Check the form" };
  const { name, phone, place } = check.value;

  const clash = await db
    .select({ id: retailers.id })
    .from(retailers)
    .where(id ? and(eq(retailers.phone, phone), ne(retailers.id, id)) : eq(retailers.phone, phone))
    .limit(1);
  if (clash.length > 0) return { ok: false, error: "Phone already used" };

  if (id) {
    await db.update(retailers).set({ name, phone, place, updatedAt: new Date() }).where(eq(retailers.id, id));
  } else {
    await db.insert(retailers).values({ name, phone, place });
  }
  revalidatePath("/retailers");
  return { ok: true };
}

/** Switches a retailer on or off. Admin and sales only. */
export async function setRetailerActive(id: string, active: boolean): Promise<RetailerResult> {
  await requireRole("sales");
  await db.update(retailers).set({ active, updatedAt: new Date() }).where(eq(retailers.id, id));
  revalidatePath("/retailers");
  return { ok: true };
}
