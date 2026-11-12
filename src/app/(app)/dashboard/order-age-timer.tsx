"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

function formatElapsed(ms: number): string {
  const totalMins = Math.max(0, Math.floor(ms / 60_000));
  if (totalMins < 1) return "Just now";
  if (totalMins < 60) return `${totalMins}m`;
  const totalHours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (totalHours < 24) return mins > 0 ? `${totalHours}h ${mins}m` : `${totalHours}h`;
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

export function OrderAgeTimer({
  sinceIso,
  initialNowMs,
}: {
  sinceIso: string;
  initialNowMs: number;
}) {
  const [nowMs, setNowMs] = useState(initialNowMs);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const sinceMs = Date.parse(sinceIso);
  if (Number.isNaN(sinceMs)) return null;

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted/70 px-2 py-0.5 text-[11px] font-bold tabular-nums text-muted-foreground">
      <Clock className="size-3 shrink-0" />
      {formatElapsed(nowMs - sinceMs)}
    </span>
  );
}
