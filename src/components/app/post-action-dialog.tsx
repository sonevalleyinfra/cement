"use client";

import { CheckCircle2, Home } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function PostActionDialog({
  open,
  title,
  message,
  primaryLabel = "Go to Home",
  secondaryLabel = "Stay here",
  primaryHref = "/dashboard",
  onSecondary,
}: {
  open: boolean;
  title: string;
  message: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  primaryHref?: string;
  onSecondary: () => void;
}) {
  const router = useRouter();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs animate-in-fade">
      <div className="w-full max-w-[310px] rounded-2xl border border-border/80 bg-card p-4 shadow-xl text-center flex flex-col items-center gap-2 animate-in-up">
        <div className="flex size-9 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-5" />
        </div>
        <div>
          <h2 className="text-sm font-black text-foreground">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{message}</p>
        </div>
        <p className="text-[11px] font-semibold text-primary">Home screen par jaana hai?</p>
        <div className="grid grid-cols-2 gap-2 w-full mt-1">
          <Button
            type="button"
            variant="outline"
            className="h-8 w-full text-xs font-semibold px-2"
            onClick={onSecondary}
          >
            {secondaryLabel}
          </Button>
          <Button
            type="button"
            className="h-8 w-full text-xs font-bold px-2"
            onClick={() => router.push(primaryHref)}
          >
            <Home className="mr-1.5 size-3.5" />
            {primaryLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
