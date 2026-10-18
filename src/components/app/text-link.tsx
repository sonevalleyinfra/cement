import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * A plain underlined link for an action ("Verify", "New payment") with a 48px tap area. Never a way back:
 * that is the `PageHeader` back chevron. The padding is cancelled by a negative margin, so it lines up like
 * a small text link.
 */
export function TextLink({
  className,
  strong = false,
  ...props
}: ComponentProps<typeof Link> & { /** Bold and dark: an action, not a way back. */ strong?: boolean }) {
  return (
    <Link
      className={cn(
        "-mx-2 inline-flex min-h-12 min-w-12 items-center justify-center px-2 text-sm underline underline-offset-2",
        strong ? "font-semibold" : "text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
