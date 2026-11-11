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

/** True if this user may read this retailer's ledger. Admin/Accounts: all. Sales: assigned shops only. Retailer: own shop only. */
export async function mayViewLedger(user: { id: string; role?: string | null }, retailerId: string) {
  const roles = {
    admin: isAdmin(user.role),
    accounts: hasRole(user.role, "accounts"),
    sales: hasRole(user.role, "sales"),
    retailer: hasRole(user.role, "retailer"),
  };
  if (roles.admin || roles.accounts) return true;
  const [own, repRows] = await Promise.all([
    roles.retailer ? ownRetailerId(user.id) : Promise.resolve(null),
    roles.sales
      ? db.select({ salesRepId: retailers.salesRepId }).from(retailers).where(eq(retailers.id, retailerId)).limit(1)
      : Promise.resolve([]),
  ]);
  return canViewLedger(roles, own, retailerId, {
    userId: user.id,
    salesRepId: repRows[0]?.salesRepId ?? null,
  });
}
