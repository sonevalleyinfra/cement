import type { FirmSlot } from "@/lib/firm-rules";
import { cn } from "@/lib/utils";

/** Firms are told apart by a fixed accent slot (a to f), never by free colour choice. */
export type { FirmSlot };

const dot: Record<FirmSlot, string> = {
  a: "bg-firm-a",
  b: "bg-firm-b",
  c: "bg-firm-c",
  d: "bg-firm-d",
  e: "bg-firm-e",
  f: "bg-firm-f",
};

export function FirmChip({
  name,
  slot,
  className,
}: {
  name: string;
  slot: FirmSlot;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full bg-muted px-2.5 text-xs font-medium",
        className,
      )}
    >
      <span className={cn("size-2 rounded-full", dot[slot])} />
      {name}
    </span>
  );
}
