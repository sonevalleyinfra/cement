"use server";

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { user, userFirms } from "@/db/schema";
import { env } from "@/env";
import { auth } from "@/lib/auth";
import { sendEmailInBackground } from "@/lib/email";
import { accountCreatedMessage } from "@/lib/email/templates";
import { joinRoles, type Role } from "@/lib/roles";
import { requireRole } from "@/lib/session";
import {
  checkRolesAndFirms,
  checkSelfDeactivate,
  checkSelfRoleChange,
  passwordFromBytes,
  validateNewUser,
} from "@/lib/user-admin-rules";

export type UserResult = { ok: true } | { ok: false; error: string };

async function replaceFirms(userId: string, firmIds: string[]) {
  await db.transaction(async (tx) => {
    await tx.delete(userFirms).where(eq(userFirms.userId, userId));
    if (firmIds.length > 0) {
      await tx.insert(userFirms).values(firmIds.map((firmId) => ({ userId, firmId })));
    }
  });
}

/**
 * Creates a user with a random temporary password nobody sees, marks the email
 * as verified (the admin vouches for it) and emails a link to choose a password.
 */
export async function createUser(form: {
  name: string;
  email: string;
  roles: string[];
  firmIds: string[];
}): Promise<UserResult> {
  await requireRole("admin");
  const check = validateNewUser(form);
  if (!check.ok) return { ok: false, error: check.error };
  const { name, email, roles, firmIds } = check.value;

  try {
    const created = await auth.api.createUser({
      headers: await headers(),
      body: {
        name,
        email,
        password: passwordFromBytes(randomBytes(16)),
        data: { emailVerified: true },
      },
    });
    await db.update(user).set({ role: joinRoles(roles) }).where(eq(user.id, created.user.id));
    await replaceFirms(created.user.id, roles.includes("admin") ? [] : firmIds);
    await auth.api.requestPasswordReset({ body: { email, redirectTo: "/reset-password" } });
    sendEmailInBackground(accountCreatedMessage(email, name, `${env.APP_URL}/sign-in`));
  } catch {
    return { ok: false, error: "Could not create the user. Is the email already used?" };
  }
  revalidatePath("/users");
  return { ok: true };
}

/** Changes a user's roles and firm access. */
export async function updateUserAccess(
  userId: string,
  form: { roles: string[]; firmIds: string[] },
): Promise<UserResult> {
  const { user: me } = (await requireRole("admin"));
  const self = checkSelfRoleChange(me.id === userId, form.roles);
  if (self) return { ok: false, error: self };
  const problem = checkRolesAndFirms(form.roles, form.firmIds);
  if (problem) return { ok: false, error: problem };

  const roles = form.roles as Role[];
  await db.update(user).set({ role: joinRoles(roles), updatedAt: new Date() }).where(eq(user.id, userId));
  await replaceFirms(userId, roles.includes("admin") ? [] : form.firmIds);
  revalidatePath("/users");
  return { ok: true };
}

/** Deactivates (Better Auth ban, which also ends their sessions) or reactivates a user. */
export async function setUserActive(userId: string, active: boolean): Promise<UserResult> {
  const { user: me } = await requireRole("admin");
  const self = checkSelfDeactivate(me.id === userId, active);
  if (self) return { ok: false, error: self };
  const h = await headers();
  if (active) await auth.api.unbanUser({ headers: h, body: { userId } });
  else await auth.api.banUser({ headers: h, body: { userId, banReason: "Deactivated by admin" } });
  revalidatePath("/users");
  return { ok: true };
}
