import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { firms, notifications, orders, retailers, user, userFirms } from "@/db/schema";
import { buildNotifications, type NotificationEvent } from "@/lib/notification-rules";
import { hasRole } from "@/lib/roles";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Saves notifications for an order event. Pass the open transaction `tx` so the
 * notifications are saved or lost together with the order change.
 * Server-only (do not import from a "use client" file).
 */
export async function notify(
  tx: Tx,
  orderId: string,
  event: NotificationEvent,
  actorId: string | null,
): Promise<void> {
  const [row] = await tx
    .select({
      firmId: orders.firmId,
      firmName: firms.name,
      retailerName: retailers.name,
      retailerUserId: retailers.userId,
      bags: orders.bags,
      placedBy: orders.placedBy,
      salesRepId: orders.salesRepId,
    })
    .from(orders)
    .innerJoin(firms, eq(orders.firmId, firms.id))
    .innerJoin(retailers, eq(orders.retailerId, retailers.id))
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!row) return;

  const firmPeople = await tx
    .select({ id: user.id, role: user.role, banned: user.banned })
    .from(userFirms)
    .innerJoin(user, eq(userFirms.userId, user.id))
    .where(eq(userFirms.firmId, row.firmId));
  const accountsIds = firmPeople
    .filter((p) => !p.banned && hasRole(p.role, "accounts"))
    .map((p) => p.id);
  const admins = await tx
    .select({ id: user.id })
    .from(user)
    .where(and(sql`${user.role} like '%admin%'`, eq(user.banned, false)));

  const drafts = buildNotifications({
    event,
    firmName: row.firmName,
    retailerName: row.retailerName,
    bags: row.bags,
    actorId,
    people: {
      salesRepId: row.salesRepId,
      placedBy: row.placedBy,
      retailerUserId: row.retailerUserId,
      accountsIds,
      adminIds: admins.map((a) => a.id),
    },
  });
  if (drafts.length === 0) return;
  await tx
    .insert(notifications)
    .values(drafts.map((d) => ({ ...d, firmId: row.firmId, orderId })));
}

export async function countUnread(userId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return r?.n ?? 0;
}
