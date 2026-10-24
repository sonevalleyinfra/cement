/**
 * The firm's bank accounts (where online payments come in), as plain functions (no database).
 * Source: cement v2 plan A7. Admin keeps the list at /bank-accounts; an online payment picks one.
 *
 * - Name: trimmed, single spaces, 1 to 60 characters, unique ignoring case (the database checks too).
 * - Last 4 digits and UPI ID are optional: empty = null. Last 4 = exactly 4 digits.
 *   A UPI ID looks like "name@bank" (letters, digits, dot, dash, underscore before the @).
 * - An account used by a payment is never deleted: it is switched off (it cannot be picked any more).
 */

export const BANK_NAME_MAX = 60;
export const UPI_ID_MAX = 60;

/** Same pattern as the database check `bank_accounts_upi_id_valid`. */
const UPI_ID = /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/;
const LAST4 = /^[0-9]{4}$/;

export type BankAccountInput = { name: string; last4: string | null; upiId: string | null };

/** Checks what the admin typed. Empty last 4 / UPI become null. */
export function checkBankAccount(raw: {
  name?: unknown;
  last4?: unknown;
  upiId?: unknown;
}): { ok: true; value: BankAccountInput } | { ok: false; error: string } {
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const name = text(raw.name).replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Enter the account name." };
  if (name.length > BANK_NAME_MAX) return { ok: false, error: `Keep the name under ${BANK_NAME_MAX} characters.` };
  const last4 = text(raw.last4);
  if (last4 && !LAST4.test(last4)) return { ok: false, error: "Last 4 digits must be 4 digits." };
  const upiId = text(raw.upiId);
  if (upiId && (upiId.length > UPI_ID_MAX || !UPI_ID.test(upiId))) return { ok: false, error: "That UPI ID doesn't look right." };
  return { ok: true, value: { name, last4: last4 || null, upiId: upiId || null } };
}

/** "SBI Current ··4521", or just the name when the last 4 digits are not set. */
export function bankAccountLabel(a: { name: string; last4: string | null }): string {
  return a.last4 ? `${a.name} ··${a.last4}` : a.name;
}

export const BANK_ACCOUNT_TAKEN = "That account is already added.";
export const BANK_ACCOUNT_IN_USE = "Used by payments. Switch it off instead.";
export const BANK_ACCOUNT_OFF = "That account is switched off.";
