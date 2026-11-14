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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in-fade">
      <div className="w-full max-w-sm rounded-3xl bg-card p-6 shadow-2xl ring-1 ring-border text-center flex flex-col items-center gap-4 animate-in-up">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-8" />
        </div>
        <div>
          <h2 className="text-lg font-black text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        </div>
        <p className="text-xs font-semibold text-primary">Kya aap Home screen par jaana chahte hain?</p>
        <div className="flex w-full flex-col gap-2 mt-1">
          <Button
            type="button"
            className="w-full h-11 text-sm font-bold"
            onClick={() => router.push(primaryHref)}
          >
            <Home className="mr-2 size-4" />
            {primaryLabel}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full h-11 text-sm font-semibold"
            onClick={onSecondary}
          >
            {secondaryLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
