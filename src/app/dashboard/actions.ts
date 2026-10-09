"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/session";

// Every server action is a public endpoint. ALWAYS check auth first.

export type UpdateNameState = { error?: string; success?: string };

const nameSchema = z.string().trim().min(1, "Name cannot be empty").max(100, "Name is too long");

export async function updateName(_prev: UpdateNameState, formData: FormData): Promise<UpdateNameState> {
  await requireUser();

  const parsed = nameSchema.safeParse(formData.get("name"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid name" };

  await auth.api.updateUser({ body: { name: parsed.data }, headers: await headers() });
  revalidatePath("/dashboard");
  return { success: "Name updated." };
}

export async function signOut() {
  await requireUser();
  await auth.api.signOut({ headers: await headers() });
  redirect("/");
}
