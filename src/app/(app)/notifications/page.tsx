import { desc, eq } from "drizzle-orm";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { formatDateTime } from "@/lib/datetime";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { markAllRead, openNotification } from "./actions";

export default async function NotificationsPage() {
  const { user } = await requireUser();
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
  const hasUnread = rows.some((r) => !r.readAt);

  if (rows.length === 0) return <EmptyState title="No notifications" />;
  return (
    <div className="flex flex-col gap-3">
      {hasUnread && (
        <form action={markAllRead} className="self-end">
          <Button type="submit" variant="ghost" size="sm">
            Mark all read
          </Button>
        </form>
      )}
      {rows.map((n) => (
        <form key={n.id} action={openNotification.bind(null, n.id)}>
          <button
            type="submit"
            className={cn(
              "flex w-full flex-col gap-1 rounded-2xl bg-card p-4 text-left shadow-card ring-1 ring-foreground/6",
              !n.readAt && "ring-2 ring-primary/40",
            )}
          >
            <span className="flex items-center gap-2 text-base font-semibold">
              {!n.readAt && <span className="size-2 shrink-0 rounded-full bg-primary" />}
              {n.title}
            </span>
            <span className="text-sm text-muted-foreground">{n.body}</span>
            <span className="text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</span>
          </button>
        </form>
      ))}
    </div>
  );
}
