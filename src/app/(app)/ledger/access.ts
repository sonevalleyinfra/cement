import { eq } from "drizzle-orm";
import { db } from "@/db";
import { retailers } from "@/db/schema";
import { canViewLedger } from "@/lib/ledger-rules";
import { hasRole, isAdmin } from "@/lib/roles";

/** The shop linked to this login (retailer role), or null. */
export async function ownRetailerId(userId: string): Promise<string | null> {
  const [own] = await db.select({ id: retailers.id }).from(retailers).where(eq(retailers.userId, userId)).limit(1);
  return own?.id ?? null;
}

/** True if this user may read this retailer's ledger. Staff: all. Retailer: own shop only. */
export async function mayViewLedger(user: { id: string; role?: string | null }, retailerId: string) {
  const roles = {
    admin: isAdmin(user.role),
    accounts: hasRole(user.role, "accounts"),
    sales: hasRole(user.role, "sales"),
    retailer: hasRole(user.role, "retailer"),
  };
  const own = roles.retailer ? await ownRetailerId(user.id) : null;
  return canViewLedger(roles, own, retailerId);
}
