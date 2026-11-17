import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Home is built from these. Each job has its own strong colour, the same everywhere, so people who
 * do not read much can find it by colour and picture: blue = orders, green = money coming in,
 * amber = something waiting for you, rose = money owed.
 */
export type JobColor = "blue" | "green" | "amber" | "rose";

const solid: Record<JobColor, string> = {
  blue: "bg-gradient-to-br from-blue-500 to-blue-700 shadow-blue-600/25",
  green: "bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-emerald-600/25",
  amber: "bg-gradient-to-br from-amber-500 to-orange-600 shadow-orange-600/25",
  rose: "bg-gradient-to-br from-rose-500 to-rose-700 shadow-rose-600/25",
};

const soft: Record<JobColor, { box: string; icon: string; text: string }> = {
  blue: { box: "bg-blue-50 ring-blue-200", icon: "bg-blue-600", text: "text-blue-900" },
  green: { box: "bg-emerald-50 ring-emerald-200", icon: "bg-emerald-600", text: "text-emerald-900" },
  amber: { box: "bg-amber-50 ring-amber-300", icon: "bg-amber-500", text: "text-amber-950" },
  rose: { box: "bg-rose-50 ring-rose-200", icon: "bg-rose-600", text: "text-rose-900" },
};

/**
 * One of a role's main jobs: a big coloured button with a large picture and two or three words.
 * Two side by side at the top of Home; nothing else on the screen is this loud.
 */
export function ActionTile({ href, title, icon: Icon, color }: { href: string; title: string; icon: LucideIcon; color: JobColor }) {
  return (
    <Link
      href={href}
      className={cn(
        "relative flex min-h-36 flex-col justify-between overflow-hidden rounded-3xl p-4 text-white shadow-lg transition-transform duration-200 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        solid[color],
      )}
    >
      {/* The same picture, very large and faint, so the tile is recognised at a glance. */}
      <Icon aria-hidden className="absolute -right-5 -bottom-5 size-28 text-white/15" strokeWidth={1.5} />
      <span aria-hidden className="relative inline-flex size-14 items-center justify-center rounded-2xl bg-white/20">
        <Icon className="size-8" strokeWidth={2.2} />
      </span>
      <span className="relative text-xl leading-tight font-bold">{title}</span>
    </Link>
  );
}

/**
 * Something that needs this person now ("1 order needs a rate", "Cash with me ₹4,000"): a tinted
 * row with a number or a few words on the left and what to do about it on the right.
 * Show it only while there is something to do; never as an empty or zero row.
 */
export function TodoRow({
  href,
  icon: Icon,
  color,
  title,
  value,
  action,
}: {
  href: string;
  icon: LucideIcon;
  color: JobColor;
  /** What it is, in a few words. */
  title: string;
  /** Optional big number shown under the title (money, a count). */
  value?: string;
  /** What tapping does ("Fill rate", "Hand over"). */
  action: string;
}) {
  const c = soft[color];
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-18 items-center gap-3 rounded-2xl px-4 py-3 ring-1 transition-transform duration-200 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        c.box,
        c.text,
      )}
    >
      <span aria-hidden className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-white", c.icon)}>
        <Icon className="size-6" strokeWidth={2.2} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("leading-tight font-semibold", value ? "text-sm" : "text-base")}>{title}</span>
        {value && <span className="tabular text-2xl leading-tight font-bold tracking-tight">{value}</span>}
      </span>
      <span className="inline-flex shrink-0 items-center gap-0.5 text-sm font-bold">
        {action}
        <ChevronRight aria-hidden className="size-5" />
      </span>
    </Link>
  );
}
