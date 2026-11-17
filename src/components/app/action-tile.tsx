import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { IconTile, type Tone } from "./icon-tile";

/**
 * A big tap target for one of a role's main jobs on Home ("New order", "Collect payment").
 * White card with an `IconTile` on top, the action name, and one short line under it (a count).
 * `featured` is the one orange card on the screen (brand gradient): the job done most often.
 * Use in a two-column grid; four tiles at most.
 */
export function ActionTile({
  href,
  title,
  sub,
  icon,
  tone = "orange",
  featured = false,
}: {
  href: string;
  /** One or two words. */
  title: string;
  /** A count or a few words ("1 needs rate"). Keeps its height when empty. */
  sub?: string;
  icon: LucideIcon;
  tone?: Tone;
  featured?: boolean;
}) {
  const Icon = icon;
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-32 flex-col justify-between gap-3 rounded-2xl p-4 transition-[transform,box-shadow] duration-200 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        featured
          ? "bg-brand-gradient text-white shadow-brand"
          : "bg-card shadow-card ring-1 ring-foreground/6 hover:-translate-y-0.5 hover:shadow-card-hover",
      )}
    >
      {featured ? (
        <span aria-hidden className="inline-flex size-10 items-center justify-center rounded-xl bg-white/20">
          <Icon className="size-5" strokeWidth={2} />
        </span>
      ) : (
        <IconTile icon={Icon} tone={tone} />
      )}
      <span className="flex flex-col gap-0.5">
        <span className="text-base leading-tight font-semibold">{title}</span>
        <span className={cn("min-h-4 text-xs", featured ? "text-white/80" : "text-muted-foreground")}>{sub}</span>
      </span>
    </Link>
  );
}

/** A small white card with one number on Home ("Cash with me ₹4,000"); the whole card is the link. */
export function StatTile({ href, label, value }: { href: string; label: string; value: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-16 flex-col justify-center gap-0.5 rounded-2xl bg-card px-4 py-3 shadow-card ring-1 ring-foreground/6 transition-[transform,box-shadow] duration-200 ease-out hover:shadow-card-hover active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="tabular truncate text-2xl leading-tight font-bold tracking-tight">{value}</span>
    </Link>
  );
}
