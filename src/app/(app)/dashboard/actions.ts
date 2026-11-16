"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { session as sessionTable } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { checkNewPassword } from "@/lib/password-rules";
import { requireUser } from "@/lib/session";

// Every server action is a public endpoint. ALWAYS check auth first.

export type UpdateNameState = { error?: string; success?: string };

const nameSchema = z.string().trim().min(1, "Name cannot be empty").max(100, "Name is too long");

export async function updateName(_prev: UpdateNameState, formData: FormData): Promise<UpdateNameState> {
  const { user: me } = await requireUser();

  const parsed = nameSchema.safeParse(formData.get("name"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid name" };

  await auth.api.updateUser({ body: { name: parsed.data }, headers: await headers() });
  // Better Auth saves the name on its own, so the activity row is a second step right after it.
  if (me.name !== parsed.data) {
    await writeAudit(db, {
      actorId: me.id,
      entity: "user",
      entityId: me.id,
      action: "rename",
      details: { before: { name: me.name }, after: { name: parsed.data } },
    });
  }
  revalidatePath("/dashboard");
  revalidatePath("/account");
  return { success: "Name updated." };
}

export type ChangePasswordResult = { ok: true } | { ok: false; error: string };

/**
 * Changes the signed-in person's own password and signs out their other devices.
 * It runs here (not straight from the browser) so the change is written to the activity log.
 */
export async function changeOwnPassword(form: {
  currentPassword: string;
  newPassword: string;
  confirm: string;
}): Promise<ChangePasswordResult> {
  const { user: me, session } = await requireUser();
  const currentPassword = typeof form?.currentPassword === "string" ? form.currentPassword : "";
  const newPassword = typeof form?.newPassword === "string" ? form.newPassword : "";
  const confirm = typeof form?.confirm === "string" ? form.confirm : "";
  const problem = checkNewPassword({ current: currentPassword, next: newPassword, confirm });
  if (problem) return { ok: false, error: problem };

  try {
    await auth.api.changePassword({
      headers: await headers(),
      body: { currentPassword, newPassword },
    });
  } catch (e) {
    const code = e && typeof e === "object" && "body" in e ? (e as { body?: { code?: string } }).body?.code : undefined;
    return {
      ok: false,
      error: code === "INVALID_PASSWORD" ? "Your current password is wrong." : "Could not change the password. Try again.",
    };
  }
  // Better Auth saves the password on its own, so these are second steps right after it.
  // Sign out every other device (this one stays signed in), so an old password keeps no session alive.
  await db.delete(sessionTable).where(and(eq(sessionTable.userId, me.id), ne(sessionTable.id, session.id)));
  await writeAudit(db, { actorId: me.id, entity: "user", entityId: me.id, action: "password", details: { how: "own" } });
  return { ok: true };
}

export async function signOut() {
  await requireUser();
  await auth.api.signOut({ headers: await headers() });
  redirect("/sign-in");
}
