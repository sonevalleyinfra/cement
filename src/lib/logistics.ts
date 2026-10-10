import { eq } from "drizzle-orm";
import { user } from "@/db/schema";
import { isValidAssignee, type LogisticsPerson } from "@/lib/dispatch-rules";
import type { DbOrTx } from "@/lib/ledger";
import { hasRole } from "@/lib/roles";

// Server-only helpers for logistics assignment (do not import from a "use client" file).
// The rules themselves are plain functions in dispatch-rules.ts.

/** Everyone with the logistics role (banned people included, the rules decide what that means). */
export async function logisticsPeople(conn: DbOrTx): Promise<LogisticsPerson[]> {
  const rows = await conn.select({ id: user.id, role: user.role, banned: user.banned }).from(user);
  return rows.filter((r) => hasRole(r.role, "logistics"));
}

/** Is this order's assignee still able to do it (logistics, not banned)? */
export async function isAssigneeStillValid(conn: DbOrTx, logisticsId: string | null): Promise<boolean> {
  if (!logisticsId) return false;
  const [person] = await conn
    .select({ id: user.id, role: user.role, banned: user.banned })
    .from(user)
    .where(eq(user.id, logisticsId));
  return isValidAssignee(person);
}
