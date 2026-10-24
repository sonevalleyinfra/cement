/**
 * Rules for a shop's master data (owner, contact, location, category, opening date, GSTIN) and the
 * admin-kept list of areas. Plain functions: no database, no request.
 * Every field is optional: empty input clears it to null (never "").
 */

import { isValidIndianMobile, normalizePhone } from "./phone-rules";
import { isShopCategory, type ShopCategory } from "./shop-lists";

export const OWNER_NAME_MAX = 80;
export const ADDRESS_MAX = 200;
export const AREA_NAME_MAX = 60;
/** The oldest opening date we accept. */
export const OPENED_ON_MIN = "1950-01-01";
/** GPS is kept to 6 decimals (about 10 cm). */
const GEO_DECIMALS = 6;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/* ---------- Areas ---------- */

/** An area name, trimmed with single spaces; null when empty or too long. */
export function cleanAreaName(name: string): string | null {
  const clean = name.trim().replace(/\s+/g, " ");
  return clean && clean.length <= AREA_NAME_MAX ? clean : null;
}

export type AreaCandidate = { id: string; active: boolean };

/**
 * Like checkSalesRepPick: a changed area must exist and be switched on. An unchanged area is kept
 * even if it was switched off since (the shop keeps it). No area (null) is always fine.
 */
export function checkAreaPick(
  pickedId: string | null,
  currentId: string | null,
  area: AreaCandidate | undefined,
): { ok: true } | { ok: false; error: string } {
  if (pickedId === null || pickedId === currentId) return { ok: true };
  if (!area || area.id !== pickedId || !area.active) return { ok: false, error: "Pick an active area" };
  return { ok: true };
}

/* ---------- GSTIN ---------- */

const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
/** Same pattern as the database CHECK. */
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** The 15th (check) character of a GSTIN, from its first 14 (the mod-36 checksum). */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = GSTIN_CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36];
}

/**
 * True for a well-formed GSTIN with a correct check character. Capitals and spaces do not matter.
 * The GSTIN is stored only; it is NEVER used for tax (no GST maths anywhere in the app).
 */
export function isValidGstin(input: string): boolean {
  const g = input.replace(/\s/g, "").toUpperCase();
  return GSTIN_PATTERN.test(g) && gstinCheckChar(g.slice(0, 14)) === g[14];
}

/* ---------- GPS ---------- */

export type Geo = { lat: number | null; lng: number | null };

const round6 = (n: number) => Number(n.toFixed(GEO_DECIMALS));

/** Both or neither; latitude -90..90, longitude -180..180; rounded to 6 decimals. */
export function cleanGeo(raw: { lat?: number | null; lng?: number | null }): Result<Geo> {
  const lat = raw.lat ?? null;
  const lng = raw.lng ?? null;
  if (lat === null && lng === null) return { ok: true, value: { lat: null, lng: null } };
  if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, error: "Pin the location again" };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return { ok: false, error: "Pin the location again" };
  return { ok: true, value: { lat: round6(lat), lng: round6(lng) } };
}

/**
 * When the GPS was taken: now when lat/lng change to a value, null when cleared,
 * undefined (keep the old time) when they did not change.
 */
export function geoCapturedAt(before: Geo, after: Geo, now: Date): Date | null | undefined {
  if (before.lat === after.lat && before.lng === after.lng) return undefined;
  return after.lat === null ? null : now;
}

/** Google Maps link for a pinned shop. */
export function mapUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/* ---------- Dates ---------- */

/** A real calendar date written as YYYY-MM-DD. */
export function isCalendarDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/* ---------- The whole master part ---------- */

/** What the form sends. Strings may be empty (= clear); lat/lng are numbers or null. */
export type ShopMasterForm = {
  ownerName: string;
  altPhone: string;
  address: string;
  areaId: string;
  pincode: string;
  lat: number | null;
  lng: number | null;
  category: string;
  openedOn: string;
  gstin: string;
};

/** Cleaned values, ready to store. */
export type ShopMaster = {
  ownerName: string | null;
  altPhone: string | null;
  address: string | null;
  areaId: string | null;
  pincode: string | null;
  lat: number | null;
  lng: number | null;
  category: ShopCategory | null;
  openedOn: string | null;
  gstin: string | null;
};

const orNull = (s: string) => (s === "" ? null : s);

/**
 * Cleans and checks the master part. Returns the first problem in a few words.
 * `phone` is the shop's main phone (10 digits) and `today` is today's date in India (YYYY-MM-DD).
 * The area is only cleaned here; whether it may be picked is checkAreaPick.
 */
export function validateShopMaster(
  raw: Partial<ShopMasterForm>,
  ctx: { phone: string; today: string },
): Result<ShopMaster> {
  const ownerName = orNull((raw.ownerName ?? "").trim().replace(/\s+/g, " "));
  if (ownerName && ownerName.length > OWNER_NAME_MAX) return { ok: false, error: "Owner name is too long" };

  const altRaw = (raw.altPhone ?? "").trim();
  const altPhone = altRaw ? normalizePhone(altRaw) : null;
  if (altPhone !== null) {
    if (!isValidIndianMobile(altPhone)) return { ok: false, error: "Alt phone must be a 10-digit mobile" };
    if (altPhone === ctx.phone) return { ok: false, error: "Alt phone is the same as phone" };
  }

  const address = orNull((raw.address ?? "").trim());
  if (address && address.length > ADDRESS_MAX) return { ok: false, error: "Address is too long" };

  const areaId = orNull((raw.areaId ?? "").trim());

  const pincode = orNull((raw.pincode ?? "").replace(/\s/g, ""));
  if (pincode && !/^[1-9][0-9]{5}$/.test(pincode)) return { ok: false, error: "Enter a 6-digit pincode" };

  const geo = cleanGeo({ lat: raw.lat, lng: raw.lng });
  if (!geo.ok) return geo;

  const categoryRaw = (raw.category ?? "").trim();
  if (categoryRaw && !isShopCategory(categoryRaw)) return { ok: false, error: "Pick a category" };
  const category = categoryRaw ? (categoryRaw as ShopCategory) : null;

  const openedOn = orNull((raw.openedOn ?? "").trim());
  if (openedOn) {
    if (!isCalendarDate(openedOn)) return { ok: false, error: "Enter a real opening date" };
    if (openedOn > ctx.today) return { ok: false, error: "Opening date can't be in the future" };
    if (openedOn < OPENED_ON_MIN) return { ok: false, error: "Opening date is too old" };
  }

  const gstin = orNull((raw.gstin ?? "").replace(/\s/g, "").toUpperCase());
  if (gstin && !isValidGstin(gstin)) return { ok: false, error: "Check the GSTIN" };

  return {
    ok: true,
    value: { ownerName, altPhone, address, areaId, pincode, ...geo.value, category, openedOn, gstin },
  };
}

/** A short message for a failed "Pin location" (GeolocationPositionError codes 1, 2, 3). */
export function geoErrorText(code: number): string {
  if (code === 1) return "Location is blocked";
  if (code === 3) return "Location took too long";
  return "Location not found";
}
