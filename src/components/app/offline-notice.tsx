"use client";

import { WifiOff } from "lucide-react";
import { useOnline } from "@/lib/use-online";

/** A static banner under the header while the phone has no network. Nothing is queued. */
export function OfflineNotice() {
  const online = useOnline();
  if (online) return null;
  return (
    <p
      role="status"
      className="mx-4 mb-2 flex min-h-12 items-center gap-2 rounded-xl bg-caution-soft px-3 text-sm font-medium text-caution-foreground"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden />
      Offline — changes won&apos;t save
    </p>
  );
}
