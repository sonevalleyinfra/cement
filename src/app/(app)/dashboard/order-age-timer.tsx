"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Clock } from "lucide-react";

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

function alertTone(ms: number): { pill: string; urgent: boolean } {
  const mins = ms / 60_000;
  if (mins >= 120) {
    return {
      pill: "bg-rose-500/15 text-rose-700 dark:text-rose-400 ring-1 ring-rose-500/35",
      urgent: true,
    };
  }
  if (mins >= 15) {
    return {
      pill: "bg-orange-500/15 text-orange-700 dark:text-orange-400 ring-1 ring-orange-500/30",
      urgent: true,
    };
  }
  return {
    pill: "bg-amber-500/15 text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/25",
    urgent: false,
  };
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
  const { pill, urgent } = alertTone(elapsedMs);
  const Icon = urgent ? AlertTriangle : Clock;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-extrabold tabular-nums ${pill}`}
    >
      <Icon className="size-3 shrink-0" />
      {formatElapsed(elapsedMs)}
    </span>
  );
}
