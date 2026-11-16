/**
 * Sign-in library (Better Auth) web addresses that are switched off.
 *
 * The admin plugin lets any admin call these straight from a browser: act as another user, change a
 * role, set a password, remove a user and so on. None of them writes to our activity log, so they are
 * closed. Our own screens do the same jobs through logged server actions (users/actions.ts,
 * dashboard/actions.ts), which call the library on the server and are not affected.
 *
 * Paths are relative to /api/auth. A closed path answers "Not Found".
 */
export const CLOSED_ADMIN_PATHS = [
  "/admin/impersonate-user",
  "/admin/stop-impersonating",
  "/admin/set-role",
  "/admin/set-user-password",
  "/admin/create-user",
  "/admin/update-user",
  "/admin/remove-user",
  "/admin/ban-user",
  "/admin/unban-user",
  "/admin/get-user",
  "/admin/list-users",
  "/admin/list-user-sessions",
  "/admin/revoke-user-session",
  "/admin/revoke-user-sessions",
  "/admin/has-permission",
] as const;

/** A person's own name, password and email change only through our logged actions, never directly. */
export const CLOSED_SELF_PATHS = ["/update-user", "/change-password", "/change-email", "/delete-user"] as const;

export const CLOSED_AUTH_PATHS: string[] = [...CLOSED_ADMIN_PATHS, ...CLOSED_SELF_PATHS];

/** True when this /api/auth path is switched off. */
export function isClosedAuthPath(path: string): boolean {
  return CLOSED_AUTH_PATHS.includes(path);
}

/**
 * An admin's own email and password are theirs alone: another admin cannot change them from the
 * users page (that would let one admin sign in as another). They use "Forgot password" instead.
 * Returns an error or null.
 */
export function checkLoginChangeOnAdmin(input: {
  isSelf: boolean;
  targetIsAdmin: boolean;
  emailChanges: boolean;
  passwordSet: boolean;
}): string | null {
  if (input.isSelf || !input.targetIsAdmin) return null;
  if (input.passwordSet) return "An admin's password cannot be set here. They use Forgot password.";
  if (input.emailChanges) return "An admin's email cannot be changed here.";
  return null;
}
