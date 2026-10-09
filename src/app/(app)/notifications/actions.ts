"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { isUuid } from "@/lib/ids";
import { requireUser } from "@/lib/session";

/** Marks one of MY notifications read, then opens its order (if it has one). */
export async function openNotification(id: string) {
  const { user } = await requireUser();
  if (!isUuid(id)) redirect("/notifications");
  const [row] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, user.id), isNull(notifications.readAt)))
    .returning({ orderId: notifications.orderId });
  let orderId = row?.orderId ?? null;
  if (!row) {
    // Already read: still just open the order, but only if it is mine.
    const [mine] = await db
      .select({ orderId: notifications.orderId })
      .from(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)))
      .limit(1);
    orderId = mine?.orderId ?? null;
  }
  revalidatePath("/notifications");
  redirect(orderId ? `/orders/${orderId}` : "/notifications");
}

/** Marks all of MY unread notifications read. */
export async function markAllRead() {
  const { user } = await requireUser();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
  revalidatePath("/notifications");
}
