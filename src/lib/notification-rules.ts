/**
 * Who gets told what, as plain functions (no database, no request).
 * Source: docs/idea.md section 8 (Notifications).
 *
 * Spec rows used:
 * - Order placed: accounts, sales rep
 * - Rate edited (we use it for "rate filled"): accounts, admin, sales rep
 * - Approved / rejected: placer, sales rep, admin
 * - Dispatched: retailer, sales rep
 * Where the spec is silent (simplest choice):
 * - Delivered: retailer, sales rep (same as dispatched)
 * - Cancelled: placer, sales rep, admin
 * Rules: the person who did the action is never told about their own action; nobody
 * gets the same notification twice; every title starts with the firm name; no
 * message ever contains a price (retailers also read these).
 */

export const NOTIFICATION_EVENTS = [
  "placed",
  "rate_filled",
  "approved",
  "rejected",
  "dispatched",
  "delivered",
  "cancelled",
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export type OrderPeople = {
  /** Sales rep on the order (may be empty). */
  salesRepId: string | null;
  placedBy: string;
  /** The login linked to the retailer shop (may be empty). */
  retailerUserId: string | null;
  /** Accounts people who work on the order's firm. */
  accountsIds: readonly string[];
  adminIds: readonly string[];
};

export type NotificationDraft = {
  userId: string;
  type: NotificationEvent;
  title: string;
  body: string;
};

export function recipientIds(
  event: NotificationEvent,
  people: OrderPeople,
  actorId: string | null,
): string[] {
  let list: (string | null)[];
  switch (event) {
    case "placed":
      list = [...people.accountsIds, people.salesRepId];
      break;
    case "rate_filled":
      list = [...people.accountsIds, ...people.adminIds, people.salesRepId];
      break;
    case "approved":
    case "rejected":
    case "cancelled":
      list = [people.placedBy, people.salesRepId, ...people.adminIds];
      break;
    case "dispatched":
    case "delivered":
      list = [people.retailerUserId, people.salesRepId];
      break;
  }
  const out: string[] = [];
  for (const id of list) {
    if (id && id !== actorId && !out.includes(id)) out.push(id);
  }
  return out;
}

const MESSAGES: Record<NotificationEvent, (what: string) => { title: string; body: string }> = {
  placed: (w) => ({ title: "New order", body: `${w} placed.` }),
  rate_filled: (w) => ({ title: "Rate filled", body: `${w} is waiting for approval.` }),
  approved: (w) => ({ title: "Order approved", body: `${w} approved.` }),
  rejected: (w) => ({ title: "Order rejected", body: `${w} rejected.` }),
  dispatched: (w) => ({ title: "Order dispatched", body: `${w} is on its way.` }),
  delivered: (w) => ({ title: "Order delivered", body: `${w} delivered.` }),
  cancelled: (w) => ({ title: "Order cancelled", body: `${w} cancelled.` }),
};

export function buildNotifications(input: {
  event: NotificationEvent;
  firmName: string;
  retailerName: string;
  bags: number;
  people: OrderPeople;
  actorId: string | null;
}): NotificationDraft[] {
  const { event, firmName, retailerName, bags, people, actorId } = input;
  const msg = MESSAGES[event](`${retailerName}, ${bags} ${bags === 1 ? "bag" : "bags"}`);
  return recipientIds(event, people, actorId).map((userId) => ({
    userId,
    type: event,
    title: `${firmName}: ${msg.title}`,
    body: msg.body,
  }));
}
