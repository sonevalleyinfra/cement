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
