/** Rules for the retailers master. Plain functions: no database, no request. */

import { hasRole } from "./roles";

/** Keeps digits only, and drops a leading 91 or 0 country/trunk prefix. */
export function normalizePhone(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

/** A 10-digit Indian mobile number starts with 6, 7, 8 or 9. */
export function isValidIndianMobile(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone);
}

export type RetailerInput = { name: string; phone: string; place: string };

export type RetailerCheck =
  | { ok: true; value: RetailerInput }
  | { ok: false; errors: Partial<Record<keyof RetailerInput, string>> };

/** Trims and checks the form. Phone is returned as 10 plain digits. */
export function validateRetailer(raw: {
  name?: string | null;
  phone?: string | null;
  place?: string | null;
}): RetailerCheck {
  const name = (raw.name ?? "").trim().replace(/\s+/g, " ");
  const phone = normalizePhone(raw.phone ?? "");
  const place = (raw.place ?? "").trim();
  const errors: Partial<Record<keyof RetailerInput, string>> = {};
  if (!name) errors.name = "Enter a name";
  if (!isValidIndianMobile(phone)) errors.phone = "Enter a 10-digit mobile";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { name, phone, place } };
}

/** True if another retailer (not `selfId`) already uses this phone. */
export function isDuplicatePhone(
  phone: string,
  existing: readonly { id: string; phone: string }[],
  selfId?: string,
): boolean {
  return existing.some((r) => r.id !== selfId && r.phone === phone);
}

/** A login (user) the admin created with the retailer role. */
export type RetailerLogin = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string | null;
  banned: boolean | null;
  deletedAt: Date | null;
};

/**
 * Logins sales may pick when adding a retailer: retailer role, not deactivated or
 * deleted, and not already linked to a shop.
 */
export function pickableRetailerLogins<T extends RetailerLogin>(
  logins: readonly T[],
  linkedUserIds: readonly (string | null)[],
): T[] {
  const taken = new Set(linkedUserIds.filter((id): id is string => id !== null));
  return logins.filter((l) => hasRole(l.role, "retailer") && !l.banned && !l.deletedAt && !taken.has(l.id));
}

/** True if the search text matches the login's name, email or phone (any part, any case). */
export function matchesRetailerSearch(login: { name: string; email: string; phone: string }, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  if (login.name.toLowerCase().includes(q) || login.email.toLowerCase().includes(q)) return true;
  const digits = q.replace(/\D/g, "");
  // Ignore a typed +91 / 0 prefix, but only when the rest is a full number.
  const phoneQuery = digits.length > 10 ? normalizePhone(digits) : digits;
  return phoneQuery.length > 0 && login.phone.includes(phoneQuery);
}

/** Server check before a picked login becomes a retailer. */
export function checkRetailerPick(
  login: RetailerLogin | undefined,
  linkedUserIds: readonly (string | null)[],
): { ok: true } | { ok: false; error: string } {
  if (!login || pickableRetailerLogins([login], []).length === 0) {
    return { ok: false, error: "Pick a retailer from the list." };
  }
  if (linkedUserIds.includes(login.id)) return { ok: false, error: "This retailer is already added." };
  if (!isValidIndianMobile(login.phone)) {
    return { ok: false, error: "This retailer has no valid phone. Ask admin to add one." };
  }
  return { ok: true };
}
