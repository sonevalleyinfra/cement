"use client";

import { useState } from "react";
import { Eye, Image as ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ProofModal({
  imageUrl,
  title = "Payment Proof",
}: {
  imageUrl: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group relative flex items-center gap-2 overflow-hidden rounded-xl bg-muted/60 p-1.5 pr-3 text-left transition hover:bg-muted ring-1 ring-foreground/10"
        >
          <img
            src={imageUrl}
            alt={title}
            className="size-10 rounded-lg object-cover ring-1 ring-border"
          />
          <div className="flex flex-col">
            <span className="flex items-center gap-1 text-xs font-semibold text-foreground group-hover:text-primary">
              <Eye className="size-3.5" aria-hidden />
              {title}
            </span>
            <span className="text-[10px] text-muted-foreground">Click to view</span>
          </div>
        </button>
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative flex max-h-[90vh] max-w-lg flex-col overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2 font-semibold">
                <ImageIcon className="size-4 text-primary" aria-hidden />
                <span>{title}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 rounded-full"
                onClick={() => setOpen(false)}
              >
                <X className="size-4" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
            <div className="flex items-center justify-center overflow-auto p-2 bg-muted/20">
              <img
                src={imageUrl}
                alt={title}
                className="max-h-[75vh] w-auto max-w-full rounded-xl object-contain shadow-sm"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
