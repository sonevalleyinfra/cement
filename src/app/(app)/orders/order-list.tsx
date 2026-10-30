import { eq, ilike, inArray, or, sql } from "drizzle-orm";
import { ListCard } from "@/components/app/list-card";
import { StatusChip } from "@/components/app/status-chip";
import { db } from "@/db";
import { dispatches, orders, products, retailers } from "@/db/schema";
import { formatDate } from "@/lib/datetime";
import { formatINR } from "@/lib/money";
import { cancelledNote } from "@/lib/order-access";
import { escapeLike, isOrderIdTerm, orderSearchTerms } from "@/lib/order-filter-rules";
import { isOrderStatus, orderValuePaise } from "@/lib/order-rules";
import { bagsText } from "@/lib/words";

const orderCardColumns = {
  id: orders.id,
  bags: orders.bags,
  ratePaise: orders.ratePaise,
  status: orders.status,
  createdAt: orders.createdAt,
  retailer: retailers.name,
  product: products.name,
};

export type OrderCardRow = {
  id: string;
  bags: number;
  ratePaise: number | null;
  status: string;
  createdAt: Date;
  retailer: string;
  product: string;
};

/** Every word must match the shop name, place, phone, or the start of the order number. */
export function orderSearchWhere(q: string) {
  return orderSearchTerms(q).map((term) => {
    const like = `%${escapeLike(term)}%`;
    return or(
      ilike(retailers.name, like),
      ilike(retailers.place, like),
      ilike(retailers.phone, like),
      isOrderIdTerm(term) ? ilike(sql`${orders.id}::text`, `${term}%`) : undefined,
    );
  });
}

export type OrderLoad = { orderId: string; bags: number; ratePaise: number };

/**
 * Truck loads: the amount counts each load at its own rate (staff only), and a cancelled
 * order shows how many bags went out.
 */
export async function getOrderLoads(orderIds: string[]): Promise<OrderLoad[]> {
  if (orderIds.length === 0) return [];
  return db
    .select({ orderId: dispatches.orderId, bags: dispatches.bags, ratePaise: dispatches.ratePaise })
    .from(dispatches)
    .where(inArray(dispatches.orderId, orderIds));
}

/** Order cards' rows: orders joined to their shop and product. Add the where, order and limit. */
export function selectOrderCards() {
  return db
    .select(orderCardColumns)
    .from(orders)
    .innerJoin(retailers, eq(orders.retailerId, retailers.id))
    .innerJoin(products, eq(orders.productId, products.id));
}

/** One order in a list. */
export function OrderCard({
  order: o,
  loads,
  href,
  index,
  showPrice,
}: {
  order: OrderCardRow;
  loads: OrderLoad[];
  href: string;
  index: number;
  showPrice: boolean;
}) {
  const own = loads.filter((l) => l.orderId === o.id);
  const value = orderValuePaise({ ...o, loads: own });
  const note = cancelledNote(o.status, o.bags, own.reduce((n, l) => n + l.bags, 0));
  return (
    <ListCard
      index={index}
      href={href}
      title={o.retailer}
      top={isOrderStatus(o.status) && <StatusChip status={o.status} />}
      bottom={
        <>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="tabular text-2xl font-bold">{bagsText(o.bags)}</span>
              {showPrice && o.ratePaise !== null && (
                <span className="tabular text-sm font-medium text-muted-foreground">@ {formatINR(o.ratePaise)}/bag</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {o.product} · {formatDate(o.createdAt)}
            </div>
            {note && <div className="text-xs text-muted-foreground">{note}</div>}
          </div>
          {showPrice && value !== null && (
            <div className="tabular text-lg font-semibold">{formatINR(value, { hidePaise: true })}</div>
          )}
        </>
      }
    />
  );
}
