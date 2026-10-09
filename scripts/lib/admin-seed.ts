/**
 * Rules for scripts/seed-admin.ts, kept as plain functions so they can be tested.
 */

/** The old default admin from earlier versions of .env.example. */
export const PLACEHOLDER_ADMIN_EMAIL = "admin@example.com";

/**
 * Returns the placeholder admin account that should be replaced by SEED_ADMIN_EMAIL,
 * or null. Only the placeholder is ever replaced, never a real admin.
 */
export function placeholderAdminToReplace<T extends { email: string }>(admins: T[], seedEmail: string): T | null {
  if (seedEmail.toLowerCase() === PLACEHOLDER_ADMIN_EMAIL) return null;
  return admins.find((a) => a.email.toLowerCase() === PLACEHOLDER_ADMIN_EMAIL) ?? null;
}
