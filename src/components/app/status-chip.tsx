import { cn } from "@/lib/utils";

export type OrderStatus = "pending" | "approved" | "rejected" | "dispatched" | "delivered";

const config: Record<OrderStatus, { label: string; chip: string; dot: string }> = {
  pending: { label: "Pending", chip: "bg-amber-100 text-amber-800", dot: "bg-status-pending" },
  approved: { label: "Approved", chip: "bg-emerald-100 text-emerald-800", dot: "bg-status-approved" },
  rejected: { label: "Rejected", chip: "bg-rose-100 text-rose-800", dot: "bg-status-rejected" },
  dispatched: { label: "Dispatched", chip: "bg-sky-100 text-sky-800", dot: "bg-status-dispatched" },
  delivered: { label: "Delivered", chip: "bg-stone-100 text-stone-700", dot: "bg-status-delivered" },
};

/** A soft coloured pill with a dot and a word. Colour carries the meaning; nothing blinks. */
export function StatusChip({ status, label: labelOverride, className }: { status: OrderStatus; label?: string; className?: string }) {
  const { label: defaultLabel, chip, dot } = config[status];
  const label = labelOverride ?? defaultLabel;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold",
        chip,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}
