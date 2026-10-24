"use server";

import { randomBytes } from "node:crypto";
import { and, eq, isNull, ne } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { user } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { env } from "@/env";
import { auth } from "@/lib/auth";
import { sendEmailInBackground } from "@/lib/email";
import { accountCreatedMessage } from "@/lib/email/templates";
import { checkTempPassword } from "@/lib/password-rules";
import { rolesFor } from "@/lib/permissions";
import { joinRoles, parseRoles, type Role } from "@/lib/roles";
import { requireRole } from "@/lib/session";
import { deactivateStaff, deleteStaff, heldCashOf, lockStaff, reactivateStaff } from "@/lib/staff-cash";
import {
  checkCashHeld,
  checkEditedPhone,
  checkRoles,
  checkSelfDeactivate,
  checkSelfRoleChange,
  cleanEmail,
  dropsAllStaffRoles,
  passwordFromBytes,
  validateNewUser,
} from "@/lib/user-admin-rules";

export type UserResult = { ok: true } | { ok: false; error: string };

/**
 * Creates a user and marks the email as verified (the admin vouches for it).
 * If the admin typed a temporary password, the user signs in with it and can change it
 * under Account. Otherwise they get a random password nobody sees and an email link to choose one.
 */
export async function createUser(form: {
  name: string;
  email: string;
  phone: string;
  roles: string[];
  password?: string;
}): Promise<UserResult> {
  const session = await requireRole(...rolesFor("manageUsers"));
  const check = validateNewUser(form);
  if (!check.ok) return { ok: false, error: check.error };
  const { name, email, phone, roles, password } = check.value;

  try {
    const created = await auth.api.createUser({
      headers: await headers(),
      body: {
        name,
        email,
        password: password ?? passwordFromBytes(randomBytes(16)),
        data: { emailVerified: true },
      },
    });
    // Roles, phone and the audit row are saved together.
    await db.transaction(async (tx) => {
      await tx.update(user).set({ role: joinRoles(roles), phone }).where(eq(user.id, created.user.id));
      await writeAudit(tx, {
        actorId: session.user.id,
        entity: "user",
        entityId: created.user.id,
        action: "create",
        details: { name, email, phone, roles, tempPassword: password !== null },
      });
    });
    if (password === null) {
      await auth.api.requestPasswordReset({ body: { email, redirectTo: "/reset-password" } });
    }
    sendEmailInBackground(accountCreatedMessage(email, name, `${env.APP_URL}/sign-in`, password !== null));
  } catch {
    return { ok: false, error: "Could not create the user. Is the email already used?" };
  }
  revalidatePath("/users");
  return { ok: true };
}

/**
 * Changes a user's email, phone and roles. A new email counts as
 * verified (the admin vouches for it, as when creating the user). They sign in with it from now on.
 * If the admin typed a new temporary password, it replaces theirs and signs them out everywhere.
 */
export async function updateUserAccess(
  userId: string,
  form: { email: string; phone: string; roles: string[]; password?: string },
): Promise<UserResult> {
  const { user: me } = await requireRole(...rolesFor("manageUsers"));
  if (!Array.isArray(form.roles)) return { ok: false, error: "Check the form" };
  const email = cleanEmail(typeof form.email === "string" ? form.email : "");
  if (!email) return { ok: false, error: "Enter a valid email" };
  const self = checkSelfRoleChange(me.id === userId, form.roles);
  if (self) return { ok: false, error: self };
  const problem = checkRoles(form.roles);
  if (problem) return { ok: false, error: problem };
  const passwordCheck = checkTempPassword(typeof form.password === "string" ? form.password : "");
  if (!passwordCheck.ok) return { ok: false, error: passwordCheck.error };
  const password = passwordCheck.value;

  const [target] = await db
    .select({ id: user.id, phone: user.phone })
    .from(user)
    .where(and(eq(user.id, userId), isNull(user.deletedAt)))
    .limit(1);
  if (!target) return { ok: false, error: "User not found." };
  const phoneCheck = checkEditedPhone(typeof form.phone === "string" ? form.phone : "", target.phone);
  if (!phoneCheck.ok) return phoneCheck;
  const phone = phoneCheck.phone;
  // Someone left with no staff role could not hand over the cash they hold. This early check fails
  // fast (before the password changes); the save below checks again with their row locked.
  const dropsStaff = dropsAllStaffRoles(form.roles);
  if (dropsStaff) {
    const held = checkCashHeld(await heldCashOf(db, userId));
    if (held) return { ok: false, error: held };
  }
  // Deleted users keep their email, so it stays taken.
  const [taken] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.email, email), ne(user.id, userId)))
    .limit(1);
  if (taken) return { ok: false, error: "Email already used" };

  // The new password goes first: if it fails, nothing else is saved.
  if (password !== null) {
    try {
      const requestHeaders = await headers();
      await auth.api.setUserPassword({ headers: requestHeaders, body: { userId, newPassword: password } });
      // Setting a password does not end their sessions, so sign them out (but not the admin themself).
      if (userId !== me.id) await auth.api.revokeUserSessions({ headers: requestHeaders, body: { userId } });
    } catch {
      return { ok: false, error: "Could not change the password. Try again." };
    }
  }

  const roles = form.roles as Role[];
  // Email, phone, role and the audit row change together, or not at all.
  const saved = await db.transaction(async (tx): Promise<UserResult> => {
    // Locked first, so a payment saved meanwhile (it locks the same row) is counted or waits.
    const locked = await lockStaff(tx, userId);
    if (!locked || locked.deletedAt) return { ok: false, error: "User not found." };
    if (dropsStaff) {
      const held = checkCashHeld(await heldCashOf(tx, userId));
      if (held) return { ok: false, error: held };
    }
    const [before] = await tx
      .select({ email: user.email, role: user.role, phone: user.phone })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    await tx
      .update(user)
      .set({ email, emailVerified: true, role: joinRoles(roles), phone, updatedAt: new Date() })
      .where(eq(user.id, userId));
    await writeAudit(tx, {
      actorId: me.id,
      entity: "user",
      entityId: userId,
      action: "update",
      details: {
        before: {
          email: before?.email ?? "",
          phone: before?.phone ?? "",
          roles: parseRoles(before?.role),
        },
        after: { email, phone, roles },
        passwordReset: password !== null,
      },
    });
    return { ok: true };
  });
  if (!saved.ok) return saved;
  revalidatePath("/users");
  return { ok: true };
}

/**
 * Deactivates (bans, which also ends their sessions) or reactivates a user, in one transaction with
 * their row locked (lib/staff-cash.ts): a payment saved at the same moment is either counted in the
 * "hand over first" check or refused because they are switched off.
 */
export async function setUserActive(userId: string, active: boolean): Promise<UserResult> {
  const { user: me } = await requireRole(...rolesFor("manageUsers"));
  const self = checkSelfDeactivate(me.id === userId, active);
  if (self) return { ok: false, error: self };
  const input = { actorId: me.id, userId };
  const res = await db.transaction((tx) => (active ? reactivateStaff(tx, input) : deactivateStaff(tx, input)));
  if (!res.ok) return res;
  revalidatePath("/users");
  return { ok: true };
}

/**
 * "Deletes" a deactivated user: marks them deleted so they leave the users page.
 * Nothing is erased, so their orders, receipts and history keep showing who did what.
 * They stay banned, so they still cannot sign in. Checked and saved with their row locked.
 */
export async function deleteUser(userId: string): Promise<UserResult> {
  const { user: me } = await requireRole(...rolesFor("manageUsers"));
  const res = await db.transaction((tx) => deleteStaff(tx, { actorId: me.id, userId, isSelf: me.id === userId }));
  if (!res.ok) return res;
  revalidatePath("/users");
  return { ok: true };
}
