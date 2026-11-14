import type { ReactNode } from "react";

/**
 * The title row at the top of every screen.
 */
export function PageHeader({
  title,
  back: _back,
  action,
  children,
}: {
  /** One or two words, or a record name on detail screens. */
  title: ReactNode;
  /** Optional href (kept for backward compatibility; back arrow is hidden across project). */
  back?: string;
  /** Right side: a StatusChip or TextLink(s). */
  action?: ReactNode;
  /** Subtitle line(s) under the title. */
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col">
      <div className="flex min-h-12 items-center gap-2">
        <h1 className="min-w-0 flex-1 text-xl leading-tight font-bold [overflow-wrap:anywhere]">{title}</h1>
        {action && <div className="flex shrink-0 items-center gap-3">{action}</div>}
      </div>
      {children && <div className="text-sm text-muted-foreground">{children}</div>}
    </header>
  );
}
