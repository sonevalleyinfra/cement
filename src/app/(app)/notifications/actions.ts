"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { isUuid } from "@/lib/ids";
import { notificationTarget } from "@/lib/notification-rules";
import { requireUser } from "@/lib/session";

/** Marks one of MY notifications read, then opens its link (only a path inside this app) or its order. */
export async function openNotification(id: string) {
  const { user } = await requireUser();
  if (!isUuid(id)) redirect("/notifications");
  const target = { orderId: notifications.orderId, link: notifications.link };
  const [row] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, user.id), isNull(notifications.readAt)))
    .returning(target);
  let found = row ?? null;
  if (!found) {
    // Already read: still open it, but only if it is mine.
    const [mine] = await db
      .select(target)
      .from(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)))
      .limit(1);
    found = mine ?? null;
  }
  revalidatePath("/notifications");
  redirect(notificationTarget(found?.link, found?.orderId));
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
