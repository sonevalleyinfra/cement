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

/** A light wash of the firm's colour behind the name. */
const wash: Record<FirmSlot, string> = {
  a: "bg-firm-a/10 ring-firm-a/20",
  b: "bg-firm-b/10 ring-firm-b/20",
  c: "bg-firm-c/10 ring-firm-c/20",
  d: "bg-firm-d/10 ring-firm-d/20",
  e: "bg-firm-e/10 ring-firm-e/20",
  f: "bg-firm-f/10 ring-firm-f/20",
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
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ring-1 ring-inset",
        wash[slot],
        className,
      )}
    >
      <span className={cn("size-2 rounded-full", dot[slot])} />
      {name}
    </span>
  );
}
