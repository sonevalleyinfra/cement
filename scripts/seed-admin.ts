/**
 * Creates the first admin from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD,
 * but only if no admin exists yet. Safe to run on every start.
 * If the only admin is the old placeholder (admin@example.com), the real admin
 * is created and the placeholder is removed.
 * Runs after migrations in docker-entrypoint.sh and via `pnpm db:seed`.
 */
import { eq, ilike } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { env } from "@/env";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { placeholderAdminToReplace } from "./lib/admin-seed";

async function main() {
  const email = env.SEED_ADMIN_EMAIL.toLowerCase();
  const candidates = await db
    .select({ id: user.id, email: user.email, role: user.role })
    .from(user)
    .where(ilike(user.role, "%admin%"));
  const admins = candidates.filter((u) => isAdmin(u.role));
  const placeholder = placeholderAdminToReplace(admins, email);

  if (admins.some((a) => a.id !== placeholder?.id)) {
    console.log("[seed] An admin already exists. Nothing to do.");
    return;
  }

  if (!(await createOrPromoteAdmin(email))) return;

  if (placeholder) {
    // Its sessions and login are deleted with it (onDelete: cascade).
    await db.delete(user).where(eq(user.id, placeholder.id));
    console.log(`[seed] Removed the placeholder admin ${placeholder.email}.`);
  }
}

/** Returns true if `email` is now an admin. */
async function createOrPromoteAdmin(email: string): Promise<boolean> {
  const [existing] = await db.select().from(user).where(eq(user.email, email));

  if (existing) {
    // Only promote an existing account if its owner proved they control the
    // inbox. Otherwise anyone could sign up with the admin email first.
    if (!existing.emailVerified) {
      console.warn(
        `[seed] ${email} already exists but is not verified, so it was NOT made admin. ` +
          "Verify that account, or set SEED_ADMIN_EMAIL to another address, then restart.",
      );
      return false;
    }
    await db.update(user).set({ role: "admin" }).where(eq(user.id, existing.id));
    console.log(`[seed] Promoted existing verified user ${email} to admin.`);
    return true;
  }

  // Server-side call without request headers: allowed for trusted scripts.
  // Goes through Better Auth so the password is hashed the same way as sign-up.
  await auth.api.createUser({
    body: {
      email,
      password: env.SEED_ADMIN_PASSWORD,
      name: "Admin",
      role: "admin",
      data: { emailVerified: true },
    },
  });
  console.log(`[seed] Created admin ${email}. Sign in and change the password (Dashboard → Change password).`);
  return true;
}

main()
  .then(() => process.exit(0)) // close the DB pool
  .catch((error: unknown) => {
    console.error("[seed] FAILED:", error instanceof Error ? error.message : error);
    if (error instanceof Error && error.cause) console.error("[seed] Cause:", error.cause);
    process.exit(1);
  });
