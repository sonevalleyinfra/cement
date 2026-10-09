import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { findAccessibleFirm } from "@/lib/firm-access";
import { hasAnyRole, isAdmin, type Role } from "@/lib/roles";

/**
 * Auth checks for pages and server actions.
 *
 * RULE: every protected page AND every server action must start with
 * `await requireUser()` or `await requireAdmin()`. A server action is a public
 * HTTP endpoint — hiding a button is not protection.
 */

/** The current session, or null. Cached for the duration of one request. */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

/** Returns the session, or redirects to /sign-in if not signed in. */
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}

/** Returns the session, or redirects away if the user is not an admin. */
export async function requireAdmin() {
  const session = await requireUser();
  if (!isAdmin(session.user.role)) redirect("/dashboard");
  return session;
}

/**
 * Returns the session if the user holds one of `roles` (admin always passes),
 * otherwise redirects to the dashboard.
 */
export async function requireRole(...roles: Role[]) {
  const session = await requireUser();
  if (!hasAnyRole(session.user.role, roles)) redirect("/dashboard");
  return session;
}

/**
 * Returns the session and the firm if the user may work on `firmId`,
 * otherwise redirects to the dashboard. Call it in every server action that
 * touches a firm's data, with the firm id the request asks for.
 */
export async function requireFirm(firmId: string) {
  const session = await requireUser();
  const firm = await findAccessibleFirm(session.user.id, session.user.role, firmId);
  if (!firm) redirect("/dashboard");
  return { session, firm };
}
