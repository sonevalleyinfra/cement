import type { OutstandingItem } from "@/lib/receipt-rules";

/**
 * Outstanding per order, as plain functions (no database).
 *
 * Choice: an order's billed amount is the net of every ledger row posted for it
 * (approval debit + rate-change adjustments + any cancel reversal), so rate edits
 * and cancelled orders are handled for free. Money already received is the sum of
 * receipt allocations for that order, ignoring bounced receipts.
 * due = billed - received, and only orders with something left are returned.
 */
export type BilledOrder = {
  orderId: string;
  firmId: string;
  retailerId: string;
  /** YYYY-MM-DD (IST) the order was placed. */
  dueSinceDate: string;
  billedPaise: number;
};

export function outstandingOrders(
  billed: readonly BilledOrder[],
  allocations: readonly { orderId: string | null; amountPaise: number }[],
): OutstandingItem[] {
  const paid = new Map<string, number>();
  for (const a of allocations) {
    if (a.orderId) paid.set(a.orderId, (paid.get(a.orderId) ?? 0) + a.amountPaise);
  }
  const out: OutstandingItem[] = [];
  for (const b of billed) {
    const due = b.billedPaise - (paid.get(b.orderId) ?? 0);
    if (due > 0) {
      out.push({
        orderId: b.orderId,
        firmId: b.firmId,
        retailerId: b.retailerId,
        dueSinceDate: b.dueSinceDate,
        duePaise: due,
      });
    }
  }
  return out;
}
