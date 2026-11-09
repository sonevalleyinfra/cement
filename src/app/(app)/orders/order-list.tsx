import { eq, ilike, inArray, or, sql } from "drizzle-orm";
import Link from "next/link";
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

/** One order in a list styled matching the modern prototype cards. */
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
  const orderNum = o.id.slice(0, 6).toUpperCase();

  return (
    <Link
      href={href}
      className="group block rounded-3xl border border-border/70 bg-card p-4 shadow-xs transition-all duration-150 hover:bg-muted/40 hover:border-primary/30 active:scale-[0.99]"
    >
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
            #ORD-{orderNum}
          </span>
          <h3 className="mt-0.5 text-base font-black text-foreground group-hover:text-primary transition-colors">
            {o.retailer}
          </h3>
          <span className="text-xs text-muted-foreground">{formatDate(o.createdAt)}</span>
        </div>
        {isOrderStatus(o.status) && <StatusChip status={o.status} />}
      </div>

      <div className="mt-3 flex items-center justify-between rounded-2xl bg-muted/30 p-3 text-xs border border-border/50">
        <div>
          <span className="text-sm font-black text-foreground">{bagsText(o.bags)}</span>
          <span className="block text-[11px] text-muted-foreground font-medium">{o.product}</span>
        </div>
        <div className="text-right">
          {showPrice && value !== null && (
            <span className="text-sm font-black text-foreground">{formatINR(value, { hidePaise: true })}</span>
          )}
          {showPrice && o.ratePaise !== null && (
            <span className="block text-[11px] text-muted-foreground font-medium">
              @ {formatINR(o.ratePaise)}/bag
            </span>
          )}
        </div>
      </div>

      {note && <div className="mt-2 text-xs text-rose-600 dark:text-rose-400 font-semibold">{note}</div>}
    </Link>
  );
}
