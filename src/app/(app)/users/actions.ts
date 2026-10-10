"use server";

import { randomBytes } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { firms, user, userFirms } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { env } from "@/env";
import { auth } from "@/lib/auth";
import { sendEmailInBackground } from "@/lib/email";
import { accountCreatedMessage } from "@/lib/email/templates";
import { isUuid } from "@/lib/ids";
import { rolesFor } from "@/lib/permissions";
import { joinRoles, parseRoles, type Role } from "@/lib/roles";
import { requireRole } from "@/lib/session";
import {
  checkRolesAndFirms,
  checkSelfDeactivate,
  checkSelfRoleChange,
  passwordFromBytes,
  validateNewUser,
} from "@/lib/user-admin-rules";

export type UserResult = { ok: true } | { ok: false; error: string };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function replaceFirms(tx: Tx, userId: string, firmIds: string[]) {
  await tx.delete(userFirms).where(eq(userFirms.userId, userId));
  if (firmIds.length > 0) {
    await tx.insert(userFirms).values(firmIds.map((firmId) => ({ userId, firmId })));
  }
}

/** True if every id is a real firm (the browser could send anything). */
async function firmsExist(firmIds: string[]): Promise<boolean> {
  if (firmIds.length === 0) return true;
  if (!firmIds.every(isUuid)) return false;
  const found = await db.select({ id: firms.id }).from(firms).where(inArray(firms.id, firmIds));
  return found.length === new Set(firmIds).size;
}

/**
 * Creates a user with a random temporary password nobody sees, marks the email
 * as verified (the admin vouches for it) and emails a link to choose a password.
 */
export async function createUser(form: {
  name: string;
  email: string;
  phone: string;
  roles: string[];
  firmIds: string[];
}): Promise<UserResult> {
  const session = await requireRole(...rolesFor("manageUsers"));
  const check = validateNewUser(form);
  if (!check.ok) return { ok: false, error: check.error };
  const { name, email, phone, roles, firmIds } = check.value;
  if (!(await firmsExist(firmIds))) return { ok: false, error: "Pick firms from the list." };

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
    // Roles, phone, firm access and the audit row are saved together.
    const keepFirms = roles.includes("admin") ? [] : firmIds;
    await db.transaction(async (tx) => {
      await tx.update(user).set({ role: joinRoles(roles), phone }).where(eq(user.id, created.user.id));
      await replaceFirms(tx, created.user.id, keepFirms);
      await writeAudit(tx, {
        actorId: session.user.id,
        entity: "user",
        entityId: created.user.id,
        action: "create",
        details: { name, email, phone, roles, firmIds: keepFirms },
      });
    });
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
  const { user: me } = await requireRole(...rolesFor("manageUsers"));
  if (!Array.isArray(form.roles) || !Array.isArray(form.firmIds)) return { ok: false, error: "Check the form" };
  const self = checkSelfRoleChange(me.id === userId, form.roles);
  if (self) return { ok: false, error: self };
  const problem = checkRolesAndFirms(form.roles, form.firmIds);
  if (problem) return { ok: false, error: problem };

  const firmIds = [...new Set(form.firmIds)];
  if (!(await firmsExist(firmIds))) return { ok: false, error: "Pick firms from the list." };
  const [target] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1);
  if (!target) return { ok: false, error: "User not found." };

  const roles = form.roles as Role[];
  // Role, firm access and the audit row change together, or not at all.
  await db.transaction(async (tx) => {
    const [before] = await tx.select({ role: user.role }).from(user).where(eq(user.id, userId)).limit(1);
    const beforeFirms = await tx.select({ firmId: userFirms.firmId }).from(userFirms).where(eq(userFirms.userId, userId));
    await tx.update(user).set({ role: joinRoles(roles), updatedAt: new Date() }).where(eq(user.id, userId));
    const keep = roles.includes("admin") ? [] : firmIds;
    await replaceFirms(tx, userId, keep);
    await writeAudit(tx, {
      actorId: me.id,
      entity: "user",
      entityId: userId,
      action: "update",
      details: {
        before: { roles: parseRoles(before?.role), firmIds: beforeFirms.map((r) => r.firmId).sort() },
        after: { roles, firmIds: [...keep].sort() },
      },
    });
  });
  revalidatePath("/users");
  return { ok: true };
}

/** Deactivates (Better Auth ban, which also ends their sessions) or reactivates a user. */
export async function setUserActive(userId: string, active: boolean): Promise<UserResult> {
  const { user: me } = await requireRole(...rolesFor("manageUsers"));
  const self = checkSelfDeactivate(me.id === userId, active);
  if (self) return { ok: false, error: self };
  const h = await headers();
  if (active) await auth.api.unbanUser({ headers: h, body: { userId } });
  else await auth.api.banUser({ headers: h, body: { userId, banReason: "Deactivated by admin" } });
  // Better Auth saves the ban on its own, so the audit row is a second step right after it.
  await writeAudit(db, { actorId: me.id, entity: "user", entityId: userId, action: active ? "activate" : "deactivate" });
  revalidatePath("/users");
  return { ok: true };
}
