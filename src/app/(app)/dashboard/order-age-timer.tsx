"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

function formatElapsed(ms: number): string {
  const totalSecs = Math.max(0, Math.floor(ms / 1_000));
  if (totalSecs < 60) return `${totalSecs}s`;
  const totalMins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (totalMins < 60) return secs > 0 ? `${totalMins}m ${secs}s` : `${totalMins}m`;
  const totalHours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (totalHours < 24) return mins > 0 ? `${totalHours}h ${mins}m` : `${totalHours}h`;
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

function alertTone(ms: number): string {
  const mins = ms / 60_000;
  if (mins >= 120) {
    return "bg-rose-500/15 text-rose-700 dark:text-rose-400 ring-1 ring-rose-500/35";
  }
  if (mins >= 15) {
    return "bg-orange-500/15 text-orange-700 dark:text-orange-400 ring-1 ring-orange-500/30";
  }
  return "bg-amber-500/15 text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/25";
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
    const id = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  const sinceMs = Date.parse(sinceIso);
  if (Number.isNaN(sinceMs)) return null;

  const elapsedMs = Math.max(0, nowMs - sinceMs);

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none ${alertTone(elapsedMs)}`}
    >
      <Clock className="size-2.5 shrink-0" />
      {formatElapsed(elapsedMs)}
    </span>
  );
}
