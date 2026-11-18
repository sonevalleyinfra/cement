"use client";

import { ChevronDown, Plus } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Keeps a form short: the fields most entries never need sit behind one "More details" row.
 * Closed at first; the fields stay mounted while closed, so what was typed is kept.
 * Pass `open` to start open (for example when one of the hidden fields already has a value).
 */
export function MoreDetails({ label = "More details", open: startOpen = false, children }: { label?: string; open?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(startOpen);
  const id = useId();
  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-12 items-center gap-2 rounded-2xl bg-card px-4 text-left text-base font-semibold text-primary shadow-card ring-1 ring-foreground/6 transition-colors active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus aria-hidden className={cn("size-5 transition-transform duration-200", open && "rotate-45")} />
        <span className="flex-1">{label}</span>
        <ChevronDown aria-hidden className={cn("size-5 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
      </button>
      <div id={id} hidden={!open} className={cn(open && "animate-in-up flex flex-col gap-5")}>
        {children}
      </div>
    </div>
  );
}
