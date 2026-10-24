import { and, desc, eq, gt, gte, isNotNull, ne, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { dispatches, orders, stockMovements } from "@/db/schema";
import { pickLastRate, type RateHint, weekRange } from "@/lib/rate-hint-rules";

/**
 * Read-only lookups for the hints under the rate and product fields (rules in rate-hint-rules.ts).
 * Server-only. Staff only: callers check the role first and never send this to a retailer.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The shop's last rate for the product (loads sent and orders with a rate), and this week's lowest
 * and highest rate for the product across all shops. `excludeOrderId` leaves out the order on screen.
 */
export async function getRateHints(input: {
  retailerId: string | null;
  productId: string;
  excludeOrderId?: string;
}): Promise<RateHint> {
  const since = new Date(Date.now() - WEEK_MS);
  const notThis = (col: typeof orders.id): SQL | undefined =>
    input.excludeOrderId ? ne(col, input.excludeOrderId) : undefined;
  const shop = input.retailerId;

  const [lastLoad, lastOrder, weekLoads, weekOrders] = await Promise.all([
    shop
      ? db
          .select({ ratePaise: dispatches.ratePaise, at: dispatches.createdAt })
          .from(dispatches)
          .innerJoin(orders, eq(dispatches.orderId, orders.id))
          // Loads only: a reversal row (minus bags, v2 B2) repeats its load's rate.
          .where(and(eq(orders.retailerId, shop), eq(orders.productId, input.productId), notThis(orders.id), gt(dispatches.bags, 0)))
          .orderBy(desc(dispatches.createdAt))
          .limit(1)
      : [],
    shop
      ? db
          .select({ ratePaise: sql<number>`${orders.ratePaise}`.mapWith(Number), at: orders.updatedAt })
          .from(orders)
          .where(
            and(
              eq(orders.retailerId, shop),
              eq(orders.productId, input.productId),
              isNotNull(orders.ratePaise),
              notThis(orders.id),
            ),
          )
          .orderBy(desc(orders.updatedAt))
          .limit(1)
      : [],
    db
      .select({
        min: sql<number | null>`min(${dispatches.ratePaise})`,
        max: sql<number | null>`max(${dispatches.ratePaise})`,
      })
      .from(dispatches)
      .innerJoin(orders, eq(dispatches.orderId, orders.id))
      .where(and(eq(orders.productId, input.productId), gte(dispatches.createdAt, since), notThis(orders.id), gt(dispatches.bags, 0))),
    db
      .select({
        min: sql<number | null>`min(${orders.ratePaise})`,
        max: sql<number | null>`max(${orders.ratePaise})`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.productId, input.productId),
          isNotNull(orders.ratePaise),
          gte(orders.updatedAt, since),
          notThis(orders.id),
        ),
      ),
  ]);

  const last = pickLastRate([...lastLoad, ...lastOrder]);
  const week = weekRange(
    [...weekLoads, ...weekOrders].flatMap((r) => [r.min, r.max]).filter((v) => v !== null).map(Number),
  );
  return { last: last ? { ratePaise: last.ratePaise, atIso: last.at.toISOString() } : null, week };
}

/** Bags of the product in stock now, all places together (the stock report's "now" total). */
export async function getStockAvailable(productId: string): Promise<number> {
  const [row] = await db
    .select({ bags: sql<number>`coalesce(sum(${stockMovements.bags}), 0)`.mapWith(Number) })
    .from(stockMovements)
    .where(eq(stockMovements.productId, productId));
  return row?.bags ?? 0;
}
