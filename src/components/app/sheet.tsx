"use client";

import { Dialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Bottom sheet for pickers and short forms. Slides up in 300ms.
 * Control it with `open` / `onOpenChange`.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop
          className={cn(
            "fixed inset-0 z-40 bg-foreground/35 transition-opacity duration-300 ease-out",
            "data-ending-style:opacity-0 data-starting-style:opacity-0",
          )}
        />
        <Dialog.Popup
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-3xl bg-background shadow-[0_-12px_40px_-12px_oklch(0.3_0.03_60/0.3)]",
            "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
            "data-ending-style:translate-y-full data-starting-style:translate-y-full",
          )}
        >
          <div className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-foreground/15" />
          <Dialog.Title className="px-5 pt-3 pb-2 text-lg font-bold">{title}</Dialog.Title>
          <div className="flex-1 overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            {children}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
