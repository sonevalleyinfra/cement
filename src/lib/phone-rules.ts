/** Phone number rules. Plain functions: no database, no request. */

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
