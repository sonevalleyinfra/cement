import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications, orders, retailers, user } from "@/db/schema";
import type { DbOrTx } from "@/lib/ledger";
import {
  buildMoneyNotifications,
  buildNotifications,
  type MoneyNotificationInput,
  type NotificationDraft,
  type NotificationEvent,
  type RateChange,
} from "@/lib/notification-rules";
import { hasRole, isAdmin } from "@/lib/roles";

// Server-only helpers (do not import from a "use client" file). Pass the open
// transaction `tx` so notifications are saved or lost together with the change.

/** Everyone who is not banned, with their roles. */
async function activePeople(conn: DbOrTx) {
  return conn
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(or(isNull(user.banned), eq(user.banned, false)));
}

/** Saves ready-made drafts, one row each. */
export async function insertNotifications(
  conn: DbOrTx,
  drafts: readonly NotificationDraft[],
  orderId: string | null = null,
): Promise<void> {
  if (drafts.length === 0) return;
  await conn.insert(notifications).values(drafts.map((d) => ({ ...d, orderId })));
}

/**
 * Saves notifications for a money event (see MONEY_EVENTS). Loads the accounts people and admins itself;
 * `collectorId` is the staff member the event is about.
 */
export async function notifyMoney(
  tx: DbOrTx,
  input: Omit<MoneyNotificationInput, "people"> & { collectorId?: string | null },
): Promise<void> {
  const { collectorId = null, ...rest } = input;
  const people = await activePeople(tx);
  const accountsIds = people.filter((p) => hasRole(p.role, "accounts")).map((p) => p.id);
  const adminIds = people.filter((p) => isAdmin(p.role)).map((p) => p.id);
  const drafts = buildMoneyNotifications({ ...rest, people: { accountsIds, adminIds, collectorId } });
  await insertNotifications(tx, drafts);
}

/** Saves notifications for an order event. */
export async function notify(
  tx: DbOrTx,
  orderId: string,
  event: NotificationEvent,
  actorId: string | null,
  /** Bags to mention instead of the whole order (one dispatch, or the bags cancelled). */
  bagsOverride?: number,
  /** "rate_edited" only: old and new rate and the reason (staff see it). */
  rate?: RateChange,
): Promise<void> {
  const [row] = await tx
    .select({
      retailerName: retailers.name,
      retailerUserId: retailers.userId,
      bags: orders.bags,
      placedBy: orders.placedBy,
      salesRepId: orders.salesRepId,
      shopSalesRepId: retailers.salesRepId,
      ratePaise: orders.ratePaise,
    })
    .from(orders)
    .innerJoin(retailers, eq(orders.retailerId, retailers.id))
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!row) return;

  const people = await activePeople(tx);
  const withRole = (role: string) => people.filter((p) => hasRole(p.role, role)).map((p) => p.id);

  const drafts = buildNotifications({
    event,
    retailerName: row.retailerName,
    bags: bagsOverride ?? row.bags,
    actorId,
    rate,
    people: {
      salesRepId: row.salesRepId,
      shopHasSalesRep: row.shopSalesRepId !== null,
      placedBy: row.placedBy,
      retailerUserId: row.retailerUserId,
      rateMissing: row.ratePaise === null,
      accountsIds: withRole("accounts"),
      logisticsIds: withRole("logistics"),
      adminIds: people.filter((p) => isAdmin(p.role)).map((p) => p.id),
    },
  });
  await insertNotifications(tx, drafts, orderId);
}

export async function countUnread(userId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return r?.n ?? 0;
}
