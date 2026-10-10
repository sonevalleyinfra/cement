"use client";

import { Check, ChevronDown } from "lucide-react";
import { useState, useTransition } from "react";
import { selectFirm } from "@/app/firm-actions";
import { cn } from "@/lib/utils";
import { firmDot, type FirmSlot } from "./firm-chip";
import { Sheet } from "./sheet";

export type SwitcherFirm = { id: string; name: string; slot: FirmSlot };

/** The firm name, large, at the left of the header. Tapping it opens a bottom sheet to switch firm. `selectedId` is a firm id or "all". */
export function FirmSwitcherClient({
  firms,
  selectedId,
  canSelectAll,
}: {
  firms: SwitcherFirm[];
  selectedId: string | null;
  canSelectAll: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const current = firms.find((f) => f.id === selectedId);

  function choose(id: string) {
    startTransition(async () => {
      await selectFirm(id);
      setOpen(false);
    });
  }

  const rows = [
    ...firms.map((f) => ({ id: f.id, label: f.name, slot: f.slot as FirmSlot | null })),
    ...(canSelectAll ? [{ id: "all", label: "All firms (view only)", slot: null }] : []),
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Switch firm"
        className="-ml-2 flex h-12 max-w-[75vw] min-w-0 items-center gap-2 rounded-xl px-2 transition-[background-color,transform] duration-150 ease-out hover:bg-muted active:scale-[0.98]"
      >
        {current && <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", firmDot[current.slot])} />}
        <span className="truncate text-xl font-extrabold tracking-tight">
          {current?.name ?? (selectedId === "all" ? "All firms" : "No firm")}
        </span>
        <ChevronDown aria-hidden className="size-5 shrink-0 text-muted-foreground" />
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="Switch firm">
        <ul className="flex flex-col gap-1">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => choose(r.id)}
                className={cn(
                  "flex h-12 w-full items-center justify-between rounded-xl px-3 text-left text-base",
                  "transition-colors duration-150",
                  r.id === selectedId ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted active:bg-muted",
                )}
              >
                {r.label}
                {r.id === selectedId && <Check className="size-4" />}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
