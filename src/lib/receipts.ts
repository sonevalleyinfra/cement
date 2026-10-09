import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { ledgerEntries, orders, receiptAllocations, receipts } from "@/db/schema";
import { toISTDateKey } from "@/lib/datetime";
import { outstandingOrders } from "@/lib/outstanding";
import type { OutstandingItem } from "@/lib/receipt-rules";

/** Orders of one retailer that still have money due, for the given firms. Server-only. */
/** A database or a transaction. */
type Conn = Pick<typeof db, "select">;

export async function getOutstanding(
  retailerId: string,
  firmIds: string[],
  conn: Conn = db,
): Promise<OutstandingItem[]> {
  if (firmIds.length === 0) return [];
  const billed = await conn
    .select({
      orderId: orders.id,
      firmId: orders.firmId,
      retailerId: orders.retailerId,
      createdAt: orders.createdAt,
      billedPaise: sql<number>`coalesce(sum(${ledgerEntries.amountPaise}), 0)::int`,
    })
    .from(ledgerEntries)
    .innerJoin(orders, eq(orders.id, ledgerEntries.orderId))
    .where(and(eq(orders.retailerId, retailerId), inArray(orders.firmId, firmIds)))
    .groupBy(orders.id);
  if (billed.length === 0) return [];
  const paid = await conn
    .select({ orderId: receiptAllocations.orderId, amountPaise: receiptAllocations.amountPaise })
    .from(receiptAllocations)
    .innerJoin(receipts, eq(receipts.id, receiptAllocations.receiptId))
    .where(
      and(
        eq(receipts.retailerId, retailerId),
        inArray(receiptAllocations.firmId, firmIds),
        ne(receipts.status, "bounced"),
      ),
    );
  return outstandingOrders(
    billed.map((b) => ({ ...b, dueSinceDate: toISTDateKey(b.createdAt) })),
    paid,
  );
}
