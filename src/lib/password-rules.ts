/**
 * Password rules shared by the sign-up, reset and change-password forms.
 * Better Auth enforces MIN_PASSWORD_LENGTH on the server too (see src/lib/auth.ts).
 */
export const MIN_PASSWORD_LENGTH = 8;

/** Checks the change-password form. Returns an error message, or null if it is fine. */
export function checkNewPassword(input: { current: string; next: string; confirm: string }): string | null {
  if (input.next.length < MIN_PASSWORD_LENGTH) {
    return `The new password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (input.next !== input.confirm) return "The two new passwords do not match.";
  if (input.next === input.current) return "The new password must be different from the current one.";
  return null;
}

/** Better Auth's default longest password (we do not change it in src/lib/auth.ts). */
export const MAX_PASSWORD_LENGTH = 128;

export type TempPasswordCheck = { ok: true; value: string | null } | { ok: false; error: string };

/**
 * Checks a temporary password an admin types for a user. Blank means "not set" (value null).
 * Spaces at the ends are refused rather than trimmed, so the admin and the user see the same password.
 */
export function checkTempPassword(raw: string | null | undefined): TempPasswordCheck {
  const value = raw ?? "";
  if (value.trim() === "") return { ok: true, value: null };
  if (value !== value.trim()) return { ok: false, error: "Remove spaces at the ends of the password" };
  if (value.length < MIN_PASSWORD_LENGTH) return { ok: false, error: `Password: at least ${MIN_PASSWORD_LENGTH} characters` };
  if (value.length > MAX_PASSWORD_LENGTH) return { ok: false, error: `Password: at most ${MAX_PASSWORD_LENGTH} characters` };
  return { ok: true, value };
}
