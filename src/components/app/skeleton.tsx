import { cn } from "@/lib/utils";

/** Static placeholder block. Plain grey: no shimmer, no pulse. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("rounded-xl bg-muted", className)} />;
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-24 rounded-2xl" />
      ))}
    </div>
  );
}
