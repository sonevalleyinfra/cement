import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** 12px muted caption above a group of cards or rows. */
export function SectionCaption({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn("px-1 text-xs font-semibold text-muted-foreground", className)}>{children}</h2>;
}
