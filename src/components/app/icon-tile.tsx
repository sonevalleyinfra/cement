import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Fixed set of soft colours for icon tiles. Pick one per section so screens stay easy to scan. */
export type Tone = "orange" | "rose" | "blue" | "green" | "violet" | "teal" | "amber" | "slate";

const tones: Record<Tone, string> = {
  orange: "bg-orange-100 text-orange-600",
  rose: "bg-rose-100 text-rose-600",
  blue: "bg-sky-100 text-sky-600",
  green: "bg-emerald-100 text-emerald-600",
  violet: "bg-violet-100 text-violet-600",
  teal: "bg-teal-100 text-teal-600",
  amber: "bg-amber-100 text-amber-600",
  slate: "bg-stone-100 text-stone-600",
};

/** A rounded square with a coloured icon. Used beside card titles, menu rows and empty states. */
export function IconTile({
  icon: Icon,
  tone = "orange",
  size = "md",
  className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        size === "md" ? "size-10 rounded-xl" : "size-14 rounded-2xl",
        tones[tone],
        className,
      )}
    >
      <Icon className={size === "md" ? "size-5" : "size-7"} strokeWidth={2} />
    </span>
  );
}
