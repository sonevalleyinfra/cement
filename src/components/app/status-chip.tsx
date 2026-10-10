import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/lib/order-rules";

export type { OrderStatus };

const config: Record<OrderStatus, { label: string; chip: string; dot: string }> = {
  placed: { label: "Placed", chip: "bg-amber-100 text-amber-800", dot: "bg-status-pending" },
  approved: { label: "Approved", chip: "bg-emerald-100 text-emerald-800", dot: "bg-status-approved" },
  rejected: { label: "Rejected", chip: "bg-rose-100 text-rose-800", dot: "bg-status-rejected" },
  partly_dispatched: { label: "Partly dispatched", chip: "bg-sky-50 text-sky-800", dot: "bg-status-dispatched" },
  dispatched: { label: "Dispatched", chip: "bg-sky-100 text-sky-800", dot: "bg-status-dispatched" },
  cancelled: { label: "Cancelled", chip: "bg-stone-100 text-stone-700", dot: "bg-status-cancelled" },
};

/**
 * A soft coloured pill with a dot and a word, one per order status. Colour carries the meaning;
 * nothing blinks. Payments reuse these colours with their own `label` (see receiptChip).
 */
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
