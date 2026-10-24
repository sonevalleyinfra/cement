import { cn } from "@/lib/utils";

const FILL = { primary: "bg-primary", caution: "bg-caution", risk: "bg-risk" } as const;

/**
 * A 4px static bar (design spec 0.3): how full something is, e.g. exposure against a credit limit.
 * `percent` is 0–100 (clamped). The fill width is set at render; it never animates. The track is the page
 * background, so it shows on the muted and red panels it sits in.
 */
export function Meter({
  percent,
  tone = "primary",
  label,
  className,
}: {
  percent: number;
  tone?: keyof typeof FILL;
  /** Read out for the bar ("Credit used"). */
  label: string;
  className?: string;
}) {
  const value = Math.min(100, Math.max(0, Math.round(percent)));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className={cn("h-1 w-full overflow-hidden rounded-full bg-background", className)}
    >
      <div className={cn("h-full rounded-full", FILL[tone])} style={{ width: `${value}%` }} />
    </div>
  );
}
