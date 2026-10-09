import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";

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
