import { cn } from "@/lib/utils";

/**
 * Class names for a pill-shaped choice (tabs, filters, payment mode, reasons): 48px tall, the
 * selected one in the primary orange. Use on a `button` or a `Link`.
 */
export function chipClass(on: boolean, className?: string) {
  return cn(
    "inline-flex h-12 shrink-0 items-center justify-center rounded-full px-4 text-sm font-semibold ring-1 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97]",
    on ? "bg-primary text-primary-foreground shadow-brand ring-primary" : "bg-card ring-foreground/10",
    className,
  );
}

/** A count badge inside a chip ("Sales 3"), set apart from the label. `on` matches the chip's state. */
export function ChipCount({ n, on }: { n: number; on: boolean }) {
  return (
    <span
      className={cn(
        "tabular ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold",
        on ? "bg-white/20" : "bg-foreground/8",
      )}
    >
      {n}
    </span>
  );
}
