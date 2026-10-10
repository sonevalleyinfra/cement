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
 * Logins admin may link to a shop: retailer role, not deactivated or deleted, and not already
 * linked to another shop. (A shop is added without a login; linking one is a separate, optional step.)
 */
export function pickableRetailerLogins<T extends RetailerLogin>(
  logins: readonly T[],
  linkedUserIds: readonly (string | null)[],
): T[] {
  const taken = new Set(linkedUserIds.filter((id): id is string => id !== null));
  return logins.filter((l) => hasRole(l.role, "retailer") && !l.banned && !l.deletedAt && !taken.has(l.id));
}
