"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import Link from "next/link";

export function NotificationBell({ initialUnread = 0 }: { initialUnread?: number }) {
  const [unread, setUnread] = useState(initialUnread);
  const [toastMessage, setToastMessage] = useState<{
    id: string;
    title: string;
    body: string;
    href: string;
  } | null>(null);
  const lastKnownIdRef = useRef<string | null>(null);
  const isFirstPollRef = useRef(true);

  useEffect(() => {
    let active = true;

    async function check() {
      try {
        const res = await fetch("/api/notifications/poll", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;

        setUnread(Number(data.unread || 0));

        if (data.latest && data.latest.id) {
          if (!isFirstPollRef.current && lastKnownIdRef.current !== data.latest.id) {
            // New notification arrived in real-time
            const href =
              data.latest.link ||
              (data.latest.orderId ? `/orders/${data.latest.orderId}` : "/notifications");
            setToastMessage({
              id: data.latest.id,
              title: data.latest.title,
              body: data.latest.body,
              href,
            });
          }
          lastKnownIdRef.current = data.latest.id;
        }
        isFirstPollRef.current = false;
      } catch {
        // network or offline
      }
    }

    check();
    const interval = setInterval(check, 3000); // Polling every 3 seconds for near-instant updates
    window.addEventListener("focus", check);

    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener("focus", check);
    };
  }, []);

  return (
    <>
      <Link
        href="/notifications"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative flex size-10 items-center justify-center rounded-full text-foreground transition-colors duration-150 hover:bg-muted active:scale-95"
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="animate-pop absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 font-bold text-primary-foreground ring-2 ring-background">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Link>

      {/* Real-time Toast Pop-up banner when new notification arrives */}
      {toastMessage && (
        <div className="fixed top-4 right-4 left-4 z-50 mx-auto max-w-sm animate-in-up">
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-primary/30 bg-card p-3.5 shadow-xl ring-1 ring-foreground/10">
            <Link
              href={toastMessage.href}
              onClick={() => setToastMessage(null)}
              className="flex items-start gap-3 flex-1 min-w-0"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Bell className="size-4" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col text-left">
                <p className="text-xs font-black text-foreground">{toastMessage.title}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{toastMessage.body}</p>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Dismiss notification"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
