import { and, desc, eq, gte, inArray, lt, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, user } from "@/db/schema";
import { activitySentence, groupFilter, groupOf, type ActivityGroup } from "@/lib/audit-rules";
import { allNames } from "@/lib/names";

/** Rows on one page of the activity log. */
export const ACTIVITY_PAGE_SIZE = 50;

export type ActivityFilters = {
  /** One person, or "" for everyone. */
  actorId: string;
  group: ActivityGroup | null;
  start: Date | null;
  end: Date | null;
  /** 0 = newest page. */
  page: number;
};

/** One page of the activity log, newest first, as readable sentences. Server-only. */
export async function getActivity(f: ActivityFilters) {
  const where: SQL[] = [];
  if (f.actorId) where.push(eq(auditLog.actorId, f.actorId));
  if (f.start) where.push(gte(auditLog.createdAt, f.start));
  if (f.end) where.push(lt(auditLog.createdAt, f.end));
  if (f.group) {
    const g = groupFilter(f.group);
    const parts = [inArray(auditLog.entity, g.entities), ...g.extra.map((x) => and(eq(auditLog.entity, x.entity), eq(auditLog.action, x.action)))];
    const any = or(...parts);
    if (any) where.push(any);
  }
  const rows = await db
    .select()
    .from(auditLog)
    .where(and(...where))
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(ACTIVITY_PAGE_SIZE + 1)
    .offset(f.page * ACTIVITY_PAGE_SIZE);
  const names = await allNames();
  return {
    hasOlder: rows.length > ACTIVITY_PAGE_SIZE,
    rows: rows.slice(0, ACTIVITY_PAGE_SIZE).map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      actorName: names.get(r.actorId) ?? "Someone",
      group: groupOf(r.entity),
      sentence: activitySentence(r, names),
    })),
  };
}

/** People for the "person" filter: everyone who has done something, by name. */
export async function activityPeople() {
  return db
    .selectDistinct({ id: user.id, name: user.name })
    .from(user)
    .innerJoin(auditLog, eq(auditLog.actorId, user.id))
    .orderBy(user.name);
}
