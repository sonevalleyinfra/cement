import { ArrowDown, ArrowUp } from "lucide-react";
import { deltaView } from "@/lib/owner-home-rules";
import { cn } from "@/lib/utils";

/**
 * Change on last month: ▲ green / ▼ red with a 12px arrow, or a muted "—" (no base, under 1%, or no change).
 * `value` is a whole percent (`unit="percent"`) or a paise difference shown as "₹1.2" (`unit="rupees"`).
 * Static: the colour is right on first paint, nothing animates.
 */
export function Delta({ value, unit = "percent", className }: { value: number | null; unit?: "percent" | "rupees"; className?: string }) {
  const d = deltaView(value, unit);
  const Icon = d.dir === "up" ? ArrowUp : d.dir === "down" ? ArrowDown : null;
  return (
    <span
      role="img"
      aria-label={d.label}
      className={cn(
        "tabular inline-flex items-center justify-end gap-0.5 text-xs font-semibold whitespace-nowrap",
        d.dir === "up" ? "text-good-foreground" : d.dir === "down" ? "text-risk-foreground" : "text-muted-foreground",
        className,
      )}
    >
      {Icon && <Icon className="size-3 shrink-0" strokeWidth={2.5} aria-hidden />}
      <span aria-hidden>{d.text}</span>
    </span>
  );
}
