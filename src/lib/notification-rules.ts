/**
 * Who gets told what, as plain functions (no database, no request).
 * Source: docs/idea.md section 8 (Notifications).
 *
 * Spec rows used for orders:
 * - Order placed: accounts, and the shop's sales person when the rate is missing
 * - Approved / rejected: placer, sales person; approved also: every logistics person
 * - Dispatched: retailer, sales person
 * - Rate changed: accounts, sales person, admin
 * Where the spec is silent (simplest choice):
 * - Rate filled (by the sales person or admin on a placed order): accounts and the sales person,
 *   so accounts know it is ready to approve.
 * - Cancelled: placer, sales person, the shop's login.
 * Money rows:
 * - Payment recorded: admin. Handover confirmed / online verified: collector.
 * - Handover rejected and receipt reversed: collector (same as handover confirmed).
 * Rules: the person who did the action is never told about their own action; nobody
 * gets the same notification twice; ORDER messages never contain a price (retailers also read these).
 * Money messages go to staff only, so they may show the amount.
 */
import { formatINR } from "@/lib/money";

export const NOTIFICATION_EVENTS = [
  "placed",
  "rate_filled",
  "rate_edited",
  "approved",
  "rejected",
  "dispatched",
  "cancelled",
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export type OrderPeople = {
  /** Sales person on the order (may be empty). */
  salesRepId: string | null;
  placedBy: string;
  /** The login linked to the retailer shop (may be empty). */
  retailerUserId: string | null;
  /** True while the order has no rate (a retailer's order waiting for its sales person). */
  rateMissing: boolean;
  /** Accounts people (not banned). */
  accountsIds: readonly string[];
  /** Logistics people (not banned). */
  logisticsIds: readonly string[];
  adminIds: readonly string[];
};

/** Money events: not about one order, staff only. */
export const MONEY_EVENTS = [
  "payment_recorded",
  "online_verified",
  "handover_confirmed",
  "handover_rejected",
  "receipt_reversed",
] as const;
export type MoneyEvent = (typeof MONEY_EVENTS)[number];

export type NotificationType = NotificationEvent | MoneyEvent;

/** One notification ready to save. `link` empty = open the order (or the list). */
export type NotificationDraft = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
};

/** Keeps real ids, drops the actor, empty values and repeats (first one wins). */
function uniqueRecipients(list: readonly (string | null | undefined)[], actorId: string | null): string[] {
  const out: string[] = [];
  for (const id of list) {
    if (id && id !== actorId && !out.includes(id)) out.push(id);
  }
  return out;
}

export function recipientIds(
  event: NotificationEvent,
  people: OrderPeople,
  actorId: string | null,
): string[] {
  let list: (string | null)[];
  switch (event) {
    case "placed":
      list = [people.rateMissing ? people.salesRepId : null, ...people.accountsIds];
      break;
    case "rate_filled":
      list = [...people.accountsIds, people.salesRepId];
      break;
    case "rate_edited":
      list = [...people.accountsIds, people.salesRepId, ...people.adminIds];
      break;
    case "approved":
      list = [people.placedBy, people.salesRepId, ...people.logisticsIds];
      break;
    case "rejected":
      list = [people.placedBy, people.salesRepId];
      break;
    case "dispatched":
      list = [people.retailerUserId, people.salesRepId];
      break;
    case "cancelled":
      list = [people.placedBy, people.salesRepId, people.retailerUserId];
      break;
  }
  return uniqueRecipients(list, actorId);
}

const MESSAGES: Record<NotificationEvent, (what: string) => { title: string; body: string }> = {
  placed: (w) => ({ title: "New order", body: `${w} placed.` }),
  rate_filled: (w) => ({ title: "Rate filled", body: `${w} is waiting for approval.` }),
  rate_edited: (w) => ({ title: "Rate changed", body: `${w}.` }),
  approved: (w) => ({ title: "Order approved", body: `${w} approved.` }),
  rejected: (w) => ({ title: "Order rejected", body: `${w} rejected.` }),
  dispatched: (w) => ({ title: "Order dispatched", body: `${w} is on its way.` }),
  cancelled: (w) => ({ title: "Order cancelled", body: `${w} cancelled.` }),
};

export function buildNotifications(input: {
  event: NotificationEvent;
  retailerName: string;
  bags: number;
  people: OrderPeople;
  actorId: string | null;
}): NotificationDraft[] {
  const { event, retailerName, bags, people, actorId } = input;
  const msg = MESSAGES[event](`${retailerName}, ${bags} ${bags === 1 ? "bag" : "bags"}`);
  return recipientIds(event, people, actorId).map((userId) => ({
    userId,
    type: event,
    title: msg.title,
    body: msg.body,
    link: null,
  }));
}

/** Who is told about a money event. */
export function moneyRecipientIds(
  event: MoneyEvent,
  people: { adminIds: readonly string[]; collectorId: string | null },
  actorId: string | null,
): string[] {
  const list = event === "payment_recorded" ? people.adminIds : [people.collectorId];
  return uniqueRecipients(list, actorId);
}

/** Where a money notification opens when the caller gives no link. */
export function defaultMoneyLink(event: MoneyEvent): string {
  return event === "handover_confirmed" || event === "handover_rejected" ? "/wallet" : "/receipts";
}

const MONEY_MESSAGES: Record<MoneyEvent, (amount: string, from: string) => { title: string; body: string }> = {
  payment_recorded: (a, f) => ({ title: "Payment recorded", body: `${a}${f}.` }),
  online_verified: (a, f) => ({ title: "Online payment verified", body: `${a}${f} verified.` }),
  handover_confirmed: (a) => ({ title: "Handover confirmed", body: `${a} cash handover confirmed.` }),
  handover_rejected: (a) => ({ title: "Handover rejected", body: `${a} cash handover rejected.` }),
  receipt_reversed: (a, f) => ({ title: "Receipt reversed", body: `${a}${f} reversed.` }),
};

export type MoneyNotificationInput = {
  event: MoneyEvent;
  /** The shop that paid, when there is one (not for handovers). */
  retailerName?: string | null;
  /** Integer paise. */
  amountPaise: number;
  people: { adminIds: readonly string[]; collectorId: string | null };
  actorId: string | null;
  /** Internal path to open, e.g. "/receipts/<id>". Default: see defaultMoneyLink. */
  link?: string | null;
  /** Why it was rejected or reversed (added to the message). */
  reason?: string | null;
};

/** Drafts for a money event, e.g. title "Payment recorded", body "₹5,000.00 from Raju Stores." */
export function buildMoneyNotifications(input: MoneyNotificationInput): NotificationDraft[] {
  const from = input.retailerName?.trim() ? ` from ${input.retailerName.trim()}` : "";
  const msg = MONEY_MESSAGES[input.event](formatINR(input.amountPaise), from);
  const reason = input.reason?.trim();
  const body = reason ? `${msg.body} Reason: ${reason}` : msg.body;
  const link = input.link ?? defaultMoneyLink(input.event);
  return moneyRecipientIds(input.event, input.people, input.actorId).map((userId) => ({
    userId,
    type: input.event,
    title: msg.title,
    body,
    link,
  }));
}

/**
 * True only for a path inside this app ("/wallet", "/receipts/abc").
 * Refuses "//evil.com" and backslashes (browsers treat both as another site) and full URLs.
 */
export function isSafeInternalPath(link: string | null | undefined): link is string {
  if (typeof link !== "string" || link.length === 0 || link.length > 300) return false;
  if (!link.startsWith("/") || link.startsWith("//")) return false;
  if (link.includes("\\")) return false;
  // No control characters (tabs and newlines are dropped by browsers, so "/\t/evil.com" becomes "//evil.com").
  for (const ch of link) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code === 127) return false;
  }
  return true;
}

/** Where tapping a notification goes: its own safe link, else its order, else the list. */
export function notificationTarget(link: string | null | undefined, orderId: string | null | undefined): string {
  if (isSafeInternalPath(link)) return link;
  if (orderId) return `/orders/${orderId}`;
  return "/notifications";
}
