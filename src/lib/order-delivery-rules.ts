/**
 * Where a new order goes, who takes it, by when, where it came from, and its two notes.
 * Plain functions (no database, no request) so they are easy to test.
 * Source: cement v2 plan A3 (01-sales-orders S1, S5).
 *
 * - Deliver to the shop (default) or to a site. A site needs its address and the receiver's phone.
 * - Source: a shop's own login is always "shop_app". Staff pick rep visit, phone, WhatsApp or office.
 * - Two notes: the shop note is visible to the shop; the staff note is NEVER sent to a shop
 *   (notesForViewer). A shop login can only write the shop note.
 */
import { isStaff } from "./permissions";
import { isValidIndianMobile, normalizePhone } from "./phone-rules";
import { hasRole } from "./roles";

export const ORDER_SOURCES = ["shop_app", "rep_visit", "phone", "whatsapp", "office"] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export const ORDER_SOURCE_LABELS: Record<OrderSource, string> = {
  shop_app: "Shop app",
  rep_visit: "Rep visit",
  phone: "Phone",
  whatsapp: "WhatsApp",
  office: "Office",
};

/** The sources staff pick from (the shop app is only for a shop's own login). */
export const STAFF_ORDER_SOURCES = ["rep_visit", "phone", "whatsapp", "office"] as const satisfies readonly OrderSource[];

export function isOrderSource(value: unknown): value is OrderSource {
  return typeof value === "string" && (ORDER_SOURCES as readonly string[]).includes(value);
}

export function orderSourceLabel(source: string | null | undefined): string {
  return isOrderSource(source) ? ORDER_SOURCE_LABELS[source] : "";
}

/** The chip picked first on the new order form: sales are usually at the shop, everyone else in the office. */
export function defaultOrderSource(role: string | null | undefined): OrderSource {
  if (!isStaff(role)) return "shop_app";
  return hasRole(role, "sales") && !hasRole(role, "admin") ? "rep_visit" : "office";
}

/** The source saved on a new order. A non-staff login is always the shop app, whatever it sends. */
export function orderSourceFor(
  role: string | null | undefined,
  picked: unknown,
): { ok: true; source: OrderSource } | { ok: false; error: string } {
  if (!isStaff(role)) return { ok: true, source: "shop_app" };
  if (typeof picked === "string" && (STAFF_ORDER_SOURCES as readonly string[]).includes(picked)) {
    return { ok: true, source: picked as OrderSource };
  }
  return { ok: false, error: "Pick where the order came from" };
}

/* ---------- Delivery ---------- */

export const DELIVER_TO = ["shop", "site"] as const;
export type DeliverTo = (typeof DELIVER_TO)[number];

export const DELIVER_TO_LABELS: Record<DeliverTo, string> = { shop: "Shop", site: "Site" };

export const MAX_SITE_ADDRESS = 200;
export const MAX_RECEIVER_NAME = 80;
/** How far ahead "needed by" may be. */
export const MAX_REQUIRED_BY_DAYS = 60;

export type DeliveryInput = {
  deliverTo?: unknown;
  siteAddress?: unknown;
  receiverName?: unknown;
  receiverPhone?: unknown;
  requiredBy?: unknown;
};

export type Delivery = {
  deliverTo: DeliverTo;
  siteAddress: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
  /** "YYYY-MM-DD" (India date) or null. */
  requiredBy: string | null;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days since 1970 for a real "YYYY-MM-DD" date, or null (e.g. "2026-02-30"). */
function dayNumber(key: string): number | null {
  const m = DATE_KEY.exec(key);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const at = Date.UTC(y, mo - 1, d);
  const back = new Date(at);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return at / 86_400_000;
}

/** "YYYY-MM-DD" `days` after the date key (used for the date input's max). */
export function addDaysToKey(key: string, days: number): string {
  const n = dayNumber(key);
  if (n === null) throw new RangeError("Not a date key");
  return new Date((n + days) * 86_400_000).toISOString().slice(0, 10);
}

/** Checks the delivery fields of a new order. `todayIstKey` is today in India ("YYYY-MM-DD", toISTDateKey). */
export function checkDelivery(
  input: DeliveryInput,
  todayIstKey: string,
): { ok: true; delivery: Delivery } | { ok: false; error: string } {
  const deliverTo = input.deliverTo ?? "shop";
  if (deliverTo !== "shop" && deliverTo !== "site") return { ok: false, error: "Pick shop or site" };

  const siteAddress = text(input.siteAddress);
  if (deliverTo === "site") {
    if (!siteAddress) return { ok: false, error: "Enter the site address" };
    if (siteAddress.length > MAX_SITE_ADDRESS) return { ok: false, error: "Keep the address under 200 characters" };
  }

  const receiverName = text(input.receiverName);
  if (receiverName.length > MAX_RECEIVER_NAME) return { ok: false, error: "Keep the name under 80 characters" };

  const phoneText = text(input.receiverPhone);
  if (deliverTo === "site" && !phoneText) return { ok: false, error: "Enter the receiver's phone" };
  const receiverPhone = phoneText ? normalizePhone(phoneText) : "";
  if (phoneText && !isValidIndianMobile(receiverPhone)) return { ok: false, error: "Enter a 10-digit phone" };

  const dateText = text(input.requiredBy);
  let requiredBy: string | null = null;
  if (dateText) {
    const day = dayNumber(dateText);
    const today = dayNumber(todayIstKey);
    if (day === null || today === null) return { ok: false, error: "Pick a date from today on" };
    if (day < today) return { ok: false, error: "Pick a date from today on" };
    if (day > today + MAX_REQUIRED_BY_DAYS) return { ok: false, error: "Pick a date within 60 days" };
    requiredBy = dateText;
  }

  return {
    ok: true,
    delivery: {
      deliverTo,
      siteAddress: deliverTo === "site" ? siteAddress : null,
      receiverName: receiverName || null,
      receiverPhone: receiverPhone || null,
      requiredBy,
    },
  };
}

/** True when a "needed by" date is before today in India (the dispatch card shows it in the caution tone). */
export function isPastRequiredBy(requiredBy: string | null | undefined, todayIstKey: string): boolean {
  return !!requiredBy && requiredBy < todayIstKey;
}

/**
 * Pending dispatch order: the earliest "needed by" first, orders without one after them;
 * ties keep the order they came in (Array.prototype.sort is stable).
 */
export function byRequiredBy<T extends { requiredBy: string | null }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.requiredBy === b.requiredBy) return 0;
    if (a.requiredBy === null) return 1;
    if (b.requiredBy === null) return -1;
    return a.requiredBy < b.requiredBy ? -1 : 1;
  });
}

/* ---------- Notes ---------- */

export const MAX_ORDER_NOTE = 300;

/** The two notes of a new order. A non-staff login (a shop) may only send the shop note. */
export function checkNotes(
  role: string | null | undefined,
  input: { staffNote?: unknown; shopNote?: unknown },
): { ok: true; staffNote: string; shopNote: string } | { ok: false; error: string } {
  const shopNote = text(input.shopNote);
  const staffNote = isStaff(role) ? text(input.staffNote) : "";
  if (shopNote.length > MAX_ORDER_NOTE || staffNote.length > MAX_ORDER_NOTE) {
    return { ok: false, error: "Keep the note under 300 characters" };
  }
  return { ok: true, staffNote, shopNote };
}

/** The notes this person may read. Only staff ever get the staff note. */
export function notesForViewer(
  role: string | null | undefined,
  order: { shopNote: string; staffNote?: string | null },
): { shopNote: string; staffNote: string | null } {
  if (!isStaff(role)) return { shopNote: order.shopNote, staffNote: null };
  return { shopNote: order.shopNote, staffNote: order.staffNote ?? "" };
}
