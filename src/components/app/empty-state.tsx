import type { ReactNode } from "react";

/** A single word or two. No explanations. */
export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <p className="text-base text-muted-foreground">{title}</p>
      {action}
    </div>
  );
}
