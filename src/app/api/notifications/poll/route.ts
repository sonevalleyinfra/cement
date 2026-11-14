import { NextResponse } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ unread: 0, latest: null });
  }

  const list = await db
    .select({
      id: notifications.id,
      title: notifications.title,
      body: notifications.body,
      link: notifications.link,
      orderId: notifications.orderId,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(and(eq(notifications.userId, session.user.id), isNull(notifications.readAt)))
    .orderBy(desc(notifications.createdAt))
    .limit(10);

  return NextResponse.json({
    unread: list.length,
    latest: list[0] ?? null,
  });
}
