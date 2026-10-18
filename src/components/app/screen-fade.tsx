"use client";

import { useEffect, useState, type ReactNode } from "react";

/** Longer than the last stagger step (150ms) plus a card fade (200ms). */
const FIRST_PAINT_MS = 400;

/**
 * The screen fades up once. While `data-first-paint` is set, cards inside it do not fade on their own
 * (see globals.css); cards that mount after that (tab switch, filtered list) fade up as usual.
 * The timer starts only once the page is visible: a hidden tab does not run animations, so dropping the
 * attribute early would replay the card fades when the tab comes back.
 */
export function ScreenFade({ children }: { children: ReactNode }) {
  const [firstPaint, setFirstPaint] = useState(true);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      if (timer !== undefined || document.visibilityState !== "visible") return;
      timer = setTimeout(() => setFirstPaint(false), FIRST_PAINT_MS);
      document.removeEventListener("visibilitychange", arm);
    };
    arm();
    if (timer === undefined) document.addEventListener("visibilitychange", arm);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", arm);
    };
  }, []);
  return (
    <div className="animate-page flex flex-1 flex-col" data-first-paint={firstPaint ? "" : undefined}>
      {children}
    </div>
  );
}
