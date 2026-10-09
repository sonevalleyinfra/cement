import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One row in a list: top line (chip + status), a title, and a bottom row of numbers.
 * Pass `href` to make the whole card tappable.
 */
export function ListCard({
  href,
  top,
  title,
  bottom,
  index = 0,
  className,
}: {
  href?: string;
  top?: ReactNode;
  title: string;
  bottom?: ReactNode;
  /** Position in the list; staggers the fade-in a little. */
  index?: number;
  className?: string;
}) {
  const body = (
    <>
      {top && <div className="flex items-center justify-between gap-2">{top}</div>}
      <div className="text-base leading-snug font-semibold">{title}</div>
      {bottom && <div className="flex items-end justify-between gap-3">{bottom}</div>}
    </>
  );
  const classes = cn(
    "animate-in-up flex flex-col gap-2.5 rounded-2xl bg-card p-4 ring-1 ring-foreground/8",
    href &&
      "transition-transform duration-150 ease-out active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-ring",
    className,
  );
  const style = { animationDelay: `${Math.min(index, 8) * 30}ms` };
  return href ? (
    <Link href={href} className={classes} style={style}>
      {body}
    </Link>
  ) : (
    <div className={classes} style={style}>
      {body}
    </div>
  );
}
