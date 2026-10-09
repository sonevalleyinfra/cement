import { cn } from "@/lib/utils";

/** Firms are told apart by a fixed accent slot (a, b, c), never by free colour choice. */
export type FirmSlot = "a" | "b" | "c";

const dot: Record<FirmSlot, string> = {
  a: "bg-firm-a",
  b: "bg-firm-b",
  c: "bg-firm-c",
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
