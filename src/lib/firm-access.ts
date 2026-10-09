import { asc, eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { firms, userFirms } from "@/db/schema";
import { canAccessFirm, isAdmin } from "@/lib/roles";

export type Firm = typeof firms.$inferSelect;

/**
 * The firms this user may work on, in a fixed order (a, b, c).
 * Admin gets every active firm; everyone else only the ones in `user_firms`.
 */
export const getAccessibleFirms = cache(
  async (userId: string, role: string | null | undefined): Promise<Firm[]> => {
    if (isAdmin(role)) {
      return db.select().from(firms).where(eq(firms.active, true)).orderBy(asc(firms.slot));
    }
    const rows = await db
      .select({ firm: firms })
      .from(userFirms)
      .innerJoin(firms, eq(userFirms.firmId, firms.id))
      .where(eq(userFirms.userId, userId))
      .orderBy(asc(firms.slot));
    return rows.map((r) => r.firm).filter((f) => f.active);
  },
);

/** The firm if the user may work on it, otherwise null. */
export async function findAccessibleFirm(
  userId: string,
  role: string | null | undefined,
  firmId: string,
): Promise<Firm | null> {
  const list = await getAccessibleFirms(userId, role);
  const ids = list.map((f) => f.id);
  if (!canAccessFirm(role, ids, firmId)) return null;
  return list.find((f) => f.id === firmId) ?? null;
}
