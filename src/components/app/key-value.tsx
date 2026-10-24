import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A facts row: 14px muted label on the left, 16px semibold value on the right (wraps, never truncates). */
export function KeyValue({ label, value, className }: { label: ReactNode; value: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-8 items-center justify-between gap-3", className)}>
      <span className="min-w-0 text-sm text-muted-foreground">{label}</span>
      <span className="tabular text-right text-base font-semibold wrap-anywhere">{value}</span>
    </div>
  );
}
