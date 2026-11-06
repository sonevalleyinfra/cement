"use client";

import { LayoutGrid, Sparkles } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export function DashboardViewToggle({ view }: { view: "simple" | "detailed" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setView = (next: "simple" | "detailed") => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (next === "simple") {
      params.delete("view");
    } else {
      params.set("view", "detailed");
    }
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname);
  };

  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-2">
      <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
        {view === "simple" ? "⚡ Quick Actions" : "📋 Detailed Register"}
      </span>
      <div className="inline-flex rounded-lg bg-muted p-1 text-xs">
        <button
          type="button"
          onClick={() => setView("simple")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1 font-semibold transition-all",
            view === "simple"
              ? "bg-background text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Sparkles className="size-3.5 text-primary" />
          <span>Simple</span>
        </button>
        <button
          type="button"
          onClick={() => setView("detailed")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1 font-semibold transition-all",
            view === "detailed"
              ? "bg-background text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <LayoutGrid className="size-3.5" />
          <span>Detailed</span>
        </button>
      </div>
    </div>
  );
}
