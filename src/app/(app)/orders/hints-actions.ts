"use server";

import { isUuid } from "@/lib/ids";
import { getRateHints, getStockAvailable } from "@/lib/order-hints";
import { isStaff } from "@/lib/permissions";
import type { RateHint } from "@/lib/rate-hint-rules";
import { requireUser } from "@/lib/session";

export type OrderHints = { rate: RateHint | null; stockBags: number };

/**
 * Hints for the new order form: the shop's last rate, this week's range and the bags in stock.
 * Staff only (the people who type a rate): anyone else gets nothing, never a rate or stock.
 * With no shop picked yet only the stock comes back.
 */
export async function getOrderHints(input: { retailerId: string | null; productId: string }): Promise<OrderHints | null> {
  const { user } = await requireUser();
  if (!isStaff(user.role)) return null;
  if (!isUuid(input?.productId)) return null;
  const retailerId = isUuid(input.retailerId) ? input.retailerId : null;
  const [rate, stockBags] = await Promise.all([
    retailerId ? getRateHints({ retailerId, productId: input.productId }) : null,
    getStockAvailable(input.productId),
  ]);
  return { rate, stockBags };
}
