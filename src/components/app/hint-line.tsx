import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TONE = {
  muted: "text-muted-foreground",
  caution: "text-caution-foreground",
  risk: "text-risk-foreground",
} as const;

/**
 * A 12px line under a field (last rate, stock). It keeps its height even when empty or loading,
 * so nothing moves when the text arrives. Caution and risk get a warning icon. No animation.
 */
export function HintLine({
  tone = "muted",
  icon,
  children,
}: {
  tone?: keyof typeof TONE;
  /** Replaces the default icon (caution / risk show a warning triangle, muted none). */
  icon?: ReactNode;
  children?: ReactNode;
}) {
  const shown = icon ?? (tone === "muted" ? null : <TriangleAlert className="size-4 shrink-0" aria-hidden />);
  return (
    <p className={cn("tabular flex min-h-5 items-center gap-1 text-xs", TONE[tone])}>
      {children ? shown : null}
      {children}
    </p>
  );
}
