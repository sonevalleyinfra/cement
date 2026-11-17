import { NextResponse } from "next/server";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ unread: 0, latest: null });
  }

  const mine = and(eq(notifications.userId, session.user.id), isNull(notifications.readAt));
  // The true unread count (the bell and the screen reader text use it) and only the newest row.
  const [[count], [latest]] = await Promise.all([
    db.select({ unread: sql<number>`count(*)`.mapWith(Number) }).from(notifications).where(mine),
    db
      .select({
        id: notifications.id,
        title: notifications.title,
        body: notifications.body,
        link: notifications.link,
        orderId: notifications.orderId,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(mine)
      .orderBy(desc(notifications.createdAt))
      .limit(1),
  ]);

  return NextResponse.json({ unread: count?.unread ?? 0, latest: latest ?? null });
}
