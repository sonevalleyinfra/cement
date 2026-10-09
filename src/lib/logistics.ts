import { eq, inArray } from "drizzle-orm";
import { user, userFirms } from "@/db/schema";
import { isValidAssignee, type LogisticsPerson } from "@/lib/dispatch-rules";
import type { DbOrTx } from "@/lib/ledger";

// Server-only helpers for logistics assignment (do not import from a "use client" file).
// The rules themselves are plain functions in dispatch-rules.ts.

/** Everyone with access to any of `firmIds`, with the firms (of those) they can use. */
export async function firmPeople(conn: DbOrTx, firmIds: readonly string[]): Promise<LogisticsPerson[]> {
  if (firmIds.length === 0) return [];
  const rows = await conn
    .select({ id: user.id, role: user.role, banned: user.banned, firmId: userFirms.firmId })
    .from(userFirms)
    .innerJoin(user, eq(userFirms.userId, user.id))
    .where(inArray(userFirms.firmId, [...firmIds]));
  const byId = new Map<string, LogisticsPerson & { firmIds: string[] }>();
  for (const r of rows) {
    const p = byId.get(r.id) ?? { id: r.id, role: r.role, banned: r.banned, firmIds: [] };
    p.firmIds.push(r.firmId);
    byId.set(r.id, p);
  }
  return [...byId.values()];
}

/** Is this order's assignee still able to do it (logistics, not banned, has the firm)? */
export async function isAssigneeStillValid(
  conn: DbOrTx,
  firmId: string,
  logisticsId: string | null,
): Promise<boolean> {
  if (!logisticsId) return false;
  const people = await firmPeople(conn, [firmId]);
  return isValidAssignee(
    people.find((p) => p.id === logisticsId),
    firmId,
  );
}
