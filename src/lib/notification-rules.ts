/**
 * Who gets told what, as plain functions (no database, no request).
 * Source: docs/idea.md section 8 (Notifications).
 *
 * Spec rows used for orders:
 * - Order placed: accounts, and the shop's sales person when the rate is missing. A shop with no
 *   sales person: every admin too (they can fill the rate or give the shop a sales person), so
 *   nothing gets stuck. This holds whoever placed it (the retailer, or a sales person covering).
 * - Approved / rejected: placer, sales person; approved also: every logistics person
 * - Dispatched: retailer, sales person
 * - Rate changed: accounts, sales person, admin
 * Where the spec is silent (simplest choice):
 * - Rate filled (by the sales person or admin on a placed order): accounts and the sales person,
 *   so accounts know it is ready to approve.
 * - Cancelled: placer, sales person, the shop's login.
 * Money rows (section 8, plus the simplest choice where it is silent):
 * - Online payment recorded and cash handover request: accounts.
 * - Handover confirmed / partly confirmed / rejected: the staff member who handed over.
 * - Online verified / rejected and payment reversed: the staff member who recorded the payment.
 * - Cash payment recorded: every admin (spec section 8), so the owner sees cash coming in.
 * Rules: the person who did the action is never told about their own action; nobody
 * gets the same notification twice; ORDER messages never contain a price (retailers also read these),
 * except "Rate changed", which goes to staff only and says old → new rate and the reason
 * (never to the shop's login, even if it were on the list).
 * Money messages go to staff only, so they may show the amount.
 */
import { formatINR } from "@/lib/money";
import { rateMoveText } from "@/lib/rate-rules";
import { bagsText, isAre } from "@/lib/words";

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
  /** False for an older shop with no sales person of its own (a sales person placing for it is on the order). */
  shopHasSalesRep: boolean;
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
  "cash_recorded",
  "online_recorded",
  "online_verified",
  "online_rejected",
  "handover_requested",
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
      list = [
        people.rateMissing ? people.salesRepId : null,
        ...people.accountsIds,
        ...(people.shopHasSalesRep ? [] : people.adminIds),
      ];
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

const MESSAGES: Record<NotificationEvent, (what: string, bags: number) => { title: string; body: string }> = {
  placed: (w) => ({ title: "New order", body: `${w} placed.` }),
  rate_filled: (w) => ({ title: "Rate filled", body: `${w} waiting for approval.` }),
  rate_edited: (w) => ({ title: "Rate changed", body: `${w}.` }),
  approved: (w) => ({ title: "Order approved", body: `${w} approved.` }),
  rejected: (w) => ({ title: "Order rejected", body: `${w} rejected.` }),
  dispatched: (w, bags) => ({ title: "Order dispatched", body: `${w} ${isAre(bags)} on the way.` }),
  cancelled: (w) => ({ title: "Order cancelled", body: `${w} cancelled.` }),
};

/** A rate change for staff: "₹350 → ₹360. Reason: price up" (the old rate may be empty). */
export type RateChange = { fromPaise: number | null; toPaise: number; reason: string };

export function rateChangeText(rate: RateChange): string {
  const move = rateMoveText(rate.fromPaise, rate.toPaise);
  const reason = rate.reason.trim();
  return reason ? `${move}. Reason: ${reason}` : move;
}

export function buildNotifications(input: {
  event: NotificationEvent;
  retailerName: string;
  bags: number;
  people: OrderPeople;
  actorId: string | null;
  /** Only used for "rate_edited": the old and new rate and why (staff only). */
  rate?: RateChange | null;
}): NotificationDraft[] {
  const { event, retailerName, bags, people, actorId } = input;
  const what = `${retailerName}, ${bagsText(bags)}`;
  const msg = MESSAGES[event](what, bags);
  const staffBody = event === "rate_edited" && input.rate ? `${what}: ${rateChangeText(input.rate)}.` : msg.body;
  return recipientIds(event, people, actorId).map((userId) => ({
    userId,
    type: event,
    title: msg.title,
    body: userId === people.retailerUserId ? msg.body : staffBody,
    link: null,
  }));
}

/** Events that go to accounts. A cash payment goes to admins; every other money event goes to the staff member it is about. */
const TO_ACCOUNTS: readonly MoneyEvent[] = ["online_recorded", "handover_requested"];

/** The people a money event may go to (all staff, never a retailer). */
export type MoneyPeople = {
  /** Accounts people (not banned). */
  accountsIds: readonly string[];
  /** Admins (not banned). */
  adminIds: readonly string[];
  /** The staff member the event is about (who recorded the payment / handed over the cash). */
  collectorId: string | null;
};

/** Who is told about a money event. */
export function moneyRecipientIds(event: MoneyEvent, people: MoneyPeople, actorId: string | null): string[] {
  const list =
    event === "cash_recorded"
      ? people.adminIds
      : TO_ACCOUNTS.includes(event)
        ? people.accountsIds
        : [people.collectorId];
  return uniqueRecipients(list, actorId);
}

/** Where a money notification opens when the caller gives no link. */
export function defaultMoneyLink(event: MoneyEvent): string {
  if (event === "online_recorded") return "/receipts/review";
  return event.startsWith("handover_") ? "/wallet" : "/receipts";
}

type MoneyText = { amount: string; from: string; of: string };

const MONEY_MESSAGES: Record<MoneyEvent, (t: MoneyText) => { title: string; body: string }> = {
  cash_recorded: (t) => ({ title: "Cash payment", body: `${t.amount} cash${t.from}.` }),
  online_recorded: (t) => ({ title: "Online payment to verify", body: `${t.amount}${t.from}.` }),
  online_verified: (t) => ({ title: "Online payment verified", body: `${t.amount}${t.from} verified.` }),
  online_rejected: (t) => ({ title: "Online payment rejected", body: `${t.amount}${t.from} rejected.` }),
  handover_requested: (t) => ({ title: "Cash handover", body: `${t.amount} cash to confirm.` }),
  handover_confirmed: (t) =>
    t.of
      ? { title: "Handover partly confirmed", body: `${t.amount} of ${t.of} received. The rest stays with you.` }
      : { title: "Handover confirmed", body: `${t.amount} cash handover confirmed.` },
  handover_rejected: (t) => ({ title: "Handover rejected", body: `${t.amount} cash handover rejected.` }),
  receipt_reversed: (t) => ({ title: "Payment reversed", body: `${t.amount}${t.from} reversed.` }),
};

export type MoneyNotificationInput = {
  event: MoneyEvent;
  /** The shop that paid, when there is one (not for handovers). */
  retailerName?: string | null;
  /** Integer paise. */
  amountPaise: number;
  /** For a handover confirmed in part: the amount that was asked for. */
  requestedPaise?: number | null;
  people: MoneyPeople;
  actorId: string | null;
  /** Internal path to open, e.g. "/receipts/<id>". Default: see defaultMoneyLink. */
  link?: string | null;
  /** Why it was rejected or reversed (added to the message). */
  reason?: string | null;
};

/** Drafts for a money event, e.g. title "Online payment verified", body "₹5,000.00 from Raju Stores verified." */
export function buildMoneyNotifications(input: MoneyNotificationInput): NotificationDraft[] {
  const from = input.retailerName?.trim() ? ` from ${input.retailerName.trim()}` : "";
  const part = input.requestedPaise != null && input.requestedPaise > input.amountPaise;
  const msg = MONEY_MESSAGES[input.event]({
    amount: formatINR(input.amountPaise),
    from,
    of: part ? formatINR(input.requestedPaise!) : "",
  });
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
