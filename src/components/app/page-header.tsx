import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The title row at the top of every screen (not Home). Always 48px tall, so screens with and without
 * an `action` line up. `back` is the parent screen's href: the arrow goes there (owner decision,
 * PLAN-v3: a back arrow on every inner screen). Only Home and More have no `back`.
 */
export function PageHeader({
  title,
  back,
  action,
  children,
}: {
  /** One or two words, or a record name on detail screens. */
  title: ReactNode;
  /** Href of the parent screen; renders the back arrow. Leave out only on More. */
  back?: string;
  /** Right side: a StatusChip or TextLink(s). */
  action?: ReactNode;
  /** Subtitle line(s) under the title. */
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col">
      <div className="flex min-h-12 items-center gap-2">
        {back && (
          <Link
            href={back}
            aria-label="Back"
            className="-mx-3 inline-flex size-12 shrink-0 items-center justify-center rounded-full text-foreground transition-[transform,background-color] duration-150 ease-out hover:bg-muted active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft aria-hidden className="size-6" />
          </Link>
        )}
        <h1 className="min-w-0 flex-1 text-xl leading-tight font-bold [overflow-wrap:anywhere]">{title}</h1>
        {action && <div className="flex shrink-0 items-center gap-3">{action}</div>}
      </div>
      {children && <div className={cn("text-sm text-muted-foreground", back && "pl-8")}>{children}</div>}
    </header>
  );
}
