import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Home is built from these. Each daily job has its own colour, the same everywhere, so people who
 * do not read much find it by colour and picture: blue = new order, violet = orders list,
 * green = money coming in, rose = money owed, amber = something waiting for you.
 * Owner rules: every daily job is a tile on Home (the bottom bar is never the only way to it),
 * and the screen stays clean: one picture and two or three words per tile, nothing decorative.
 */
export type JobColor = "blue" | "green" | "amber" | "rose" | "violet" | "slate";

const solid: Record<JobColor, string> = {
  blue: "bg-blue-600",
  green: "bg-emerald-600",
  amber: "bg-amber-500",
  rose: "bg-rose-600",
  violet: "bg-violet-600",
  slate: "bg-slate-600",
};

const tint: Record<JobColor, string> = {
  blue: "bg-blue-100 text-blue-700",
  green: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  rose: "bg-rose-100 text-rose-700",
  violet: "bg-violet-100 text-violet-700",
  slate: "bg-slate-100 text-slate-700",
};

/** One daily job: a big coloured button with a picture and two or three words. Two per row. */
export function ActionTile({ href, title, icon: Icon, color }: { href: string; title: string; icon: LucideIcon; color: JobColor }) {
  // A phone number is dialled by the phone itself, so it is a plain link.
  const Tag = href.startsWith("tel:") ? "a" : Link;
  return (
    <Tag
      href={href}
      className={cn(
        "flex min-h-28 flex-col justify-between rounded-3xl p-4 text-white transition-transform duration-200 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        solid[color],
      )}
    >
      <Icon aria-hidden className="size-9" strokeWidth={2} />
      <span className="text-lg leading-tight font-bold">{title}</span>
    </Tag>
  );
}

/**
 * Something that needs this person now ("1 order needs a rate", "Cash with me"): one plain row
 * with a small coloured picture, a few words and, when it helps, a number on the right.
 * Rows sit together in one white card (`TodoList`). Show a row only while there is something to do.
 */
export function TodoRow({
  href,
  icon: Icon,
  color,
  title,
  value,
}: {
  href: string;
  icon: LucideIcon;
  color: JobColor;
  title: string;
  /** Optional number on the right (money, a count). */
  value?: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-16 items-center gap-3 px-4 transition-colors duration-150 active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <span aria-hidden className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-xl", tint[color])}>
        <Icon className="size-5" strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1 text-base leading-tight font-semibold">{title}</span>
      {value && <span className="tabular shrink-0 text-lg font-bold">{value}</span>}
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground/60" />
    </Link>
  );
}

/** One white card holding rows, with a hairline between them. Renders nothing when it has no rows. */
export function RowCard({ children }: { children: React.ReactNode }) {
  const rows = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  if (rows.length === 0) return null;
  return <div className="flex flex-col divide-y divide-foreground/8 overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-foreground/6">{rows}</div>;
}

/** A small heading above a card or a row of numbers on Home. */
export function HomeHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="px-1 text-base font-bold">{children}</h2>;
}

/** One number for today on Home: a small label and the number. Two per row. Tap opens `href`. */
export function HomeStat({ label, value, href }: { label: string; value: string; href?: string }) {
  const box = "flex min-h-16 flex-col justify-center rounded-2xl bg-card px-4 py-2.5 shadow-card ring-1 ring-foreground/6";
  const inner = (
    <>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="tabular text-xl leading-tight font-bold">{value}</span>
    </>
  );
  return href ? (
    <Link href={href} className={cn(box, "transition-colors active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>
      {inner}
    </Link>
  ) : (
    <div className={box}>{inner}</div>
  );
}
