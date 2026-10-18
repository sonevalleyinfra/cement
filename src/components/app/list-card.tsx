import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { stagger } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * One row in a list: top line (chip + status), a title, and a bottom row of numbers.
 * Pass `href` (a link) or `onClick` (opens a sheet) to make the whole card tappable, `icon` (an `IconTile`)
 * to show it beside the title, and `featured` for the one highlighted card on a screen (brand gradient, white text).
 */
export function ListCard({
  href,
  onClick,
  top,
  title,
  icon,
  bottom,
  index = 0,
  featured = false,
  className,
}: {
  href?: string;
  onClick?: () => void;
  top?: ReactNode;
  title: string;
  icon?: ReactNode;
  bottom?: ReactNode;
  /** Position in the list; staggers the fade-in a little. */
  index?: number;
  featured?: boolean;
  className?: string;
}) {
  const body = (
    <>
      {top && <div className="flex items-center justify-between gap-2">{top}</div>}
      <div className="flex items-center gap-3">
        {icon}
        <div className="flex-1 text-base leading-snug font-semibold">{title}</div>
        {(href || onClick) && (
          <ChevronRight
            aria-hidden
            className={cn(
              "size-5 shrink-0 transition-transform duration-200 ease-out group-hover/card:translate-x-0.5",
              featured ? "text-white/80" : "text-muted-foreground/60",
            )}
          />
        )}
      </div>
      {bottom && <div className="flex items-end justify-between gap-3">{bottom}</div>}
    </>
  );
  const classes = cn(
    "group/card animate-in-up relative flex flex-col gap-3 overflow-hidden rounded-2xl p-4",
    featured
      ? "bg-brand-gradient text-white shadow-brand [--muted-foreground:oklch(1_0_0/0.8)]"
      : "bg-card shadow-card ring-1 ring-foreground/6",
    (href || onClick) &&
      "transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-card-hover active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-ring",
    className,
  );
  const style = stagger(index);
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(classes, "w-full text-left")} style={style}>
        {body}
      </button>
    );
  }
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
