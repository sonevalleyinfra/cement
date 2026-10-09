"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAccessibleFirms } from "@/lib/firm-access";
import { FIRM_COOKIE, isValidFirmChoice } from "@/lib/firm-selection";
import { isAdmin } from "@/lib/roles";
import { requireUser } from "@/lib/session";

/** Remembers the chosen firm (a firm id, or "all" for admin). Invalid choices are ignored. */
export async function selectFirm(choice: string) {
  const { user } = await requireUser();
  const firms = await getAccessibleFirms(user.id, user.role);
  if (!isValidFirmChoice(choice, firms.map((f) => f.id), isAdmin(user.role))) return;
  (await cookies()).set(FIRM_COOKIE, choice, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
