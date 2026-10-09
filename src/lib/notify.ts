import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { firms, notifications, orders, retailers, user, userFirms } from "@/db/schema";
import type { DbOrTx } from "@/lib/ledger";
import {
  buildMoneyNotifications,
  buildNotifications,
  type MoneyNotificationInput,
  type NotificationDraft,
  type NotificationEvent,
} from "@/lib/notification-rules";
import { hasRole, isAdmin } from "@/lib/roles";

// Server-only helpers (do not import from a "use client" file). Pass the open
// transaction `tx` so notifications are saved or lost together with the change.

/** Ids of every admin who is not banned. */
export async function activeAdminIds(conn: DbOrTx): Promise<string[]> {
  const rows = await conn
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(or(isNull(user.banned), eq(user.banned, false)));
  return rows.filter((r) => isAdmin(r.role)).map((r) => r.id);
}

/** Saves ready-made drafts, one row each. `firmId` empty = the money spans several firms. */
export async function insertNotifications(
  conn: DbOrTx,
  drafts: readonly NotificationDraft[],
  where: { firmId: string | null; orderId?: string | null },
): Promise<void> {
  if (drafts.length === 0) return;
  await conn.insert(notifications).values(
    drafts.map((d) => ({ ...d, firmId: where.firmId, orderId: where.orderId ?? null })),
  );
}

/**
 * Saves notifications for a money event (payment recorded, online verified, handover
 * confirmed / rejected, receipt reversed). Loads the admins itself when they are needed.
 */
export async function notifyMoney(
  tx: DbOrTx,
  input: Omit<MoneyNotificationInput, "people"> & { firmId: string | null; collectorId?: string | null },
): Promise<void> {
  const { firmId, collectorId = null, ...rest } = input;
  const adminIds = input.event === "payment_recorded" ? await activeAdminIds(tx) : [];
  const drafts = buildMoneyNotifications({ ...rest, people: { adminIds, collectorId } });
  await insertNotifications(tx, drafts, { firmId });
}

/** Saves notifications for an order event. */
export async function notify(
  tx: DbOrTx,
  orderId: string,
  event: NotificationEvent,
  actorId: string | null,
  /** Bags to mention instead of the whole order (a partial dispatch). */
  bagsOverride?: number,
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
      logisticsId: orders.logisticsId,
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

  const drafts = buildNotifications({
    event,
    firmName: row.firmName,
    retailerName: row.retailerName,
    bags: bagsOverride ?? row.bags,
    actorId,
    people: {
      salesRepId: row.salesRepId,
      placedBy: row.placedBy,
      retailerUserId: row.retailerUserId,
      logisticsId: row.logisticsId,
      accountsIds,
      adminIds: await activeAdminIds(tx),
    },
  });
  await insertNotifications(tx, drafts, { firmId: row.firmId, orderId });
}

export async function countUnread(userId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return r?.n ?? 0;
}
