import { cn } from "@/lib/utils";

export type OrderStatus = "pending" | "approved" | "rejected" | "dispatched" | "delivered";

const config: Record<OrderStatus, { label: string; dot: string }> = {
  pending: { label: "Pending", dot: "bg-status-pending" },
  approved: { label: "Approved", dot: "bg-status-approved" },
  rejected: { label: "Rejected", dot: "bg-status-rejected" },
  dispatched: { label: "Dispatched", dot: "bg-status-dispatched" },
  delivered: { label: "Delivered", dot: "bg-status-delivered" },
};

/** A still dot plus a word. Colour carries the meaning; nothing blinks. */
export function StatusChip({ status, label: labelOverride, className }: { status: OrderStatus; label?: string; className?: string }) {
  const { label: defaultLabel, dot } = config[status];
  const label = labelOverride ?? defaultLabel;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      <span className={cn("size-2 rounded-full", dot)} />
      {label}
    </span>
  );
}
