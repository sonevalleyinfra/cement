/** Rules for the retailers master. Plain functions: no database, no request. */

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
