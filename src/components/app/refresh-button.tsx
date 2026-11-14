"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export function RefreshButton({ className }: { className?: string }) {
  const router = useRouter();
  const [spinning, setSpinning] = useState(false);

  function refresh() {
    setSpinning(true);
    router.refresh();
    setTimeout(() => setSpinning(false), 700);
  }

  return (
    <button
      type="button"
      onClick={refresh}
      aria-label="Refresh data"
      title="Refresh"
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground active:scale-90",
        className,
      )}
    >
      <RefreshCw className={cn("size-4 transition-transform", spinning && "animate-spin text-primary")} />
    </button>
  );
}
