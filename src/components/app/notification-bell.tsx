import { Bell } from "lucide-react";
import Link from "next/link";
import { countUnread } from "@/lib/notify";
import { requireUser } from "@/lib/session";

/** Bell with the unread count. Rendered on the server, so it is right on every page load. */
export async function NotificationBell() {
  const { user } = await requireUser();
  const unread = await countUnread(user.id);
  return (
    <Link
      href="/notifications"
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      className="relative flex size-12 items-center justify-center rounded-full transition-colors duration-150 hover:bg-primary/8 active:bg-primary/12"
    >
      <Bell className="size-5" />
      {unread > 0 && (
        <span className="animate-pop absolute top-1.5 right-1.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 font-bold text-primary-foreground ring-2 ring-background">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
