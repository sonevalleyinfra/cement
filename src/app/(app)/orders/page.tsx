import { and, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { FilterTabs } from "@/components/app/filter-tabs";
import { ListCard } from "@/components/app/list-card";
import { PageHeader } from "@/components/app/page-header";
import { PinnedAction } from "@/components/app/pinned-action";
import { StatusChip } from "@/components/app/status-chip";
import { TextLink } from "@/components/app/text-link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { dispatches, orders, products, retailers } from "@/db/schema";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/datetime";
import { canPlaceOrder, canSeePrice, cancelledNote, orderListScope } from "@/lib/order-access";
import {
  buildOrdersHref,
  escapeLike,
  isOrderIdTerm,
  ORDER_PAGE_SIZE,
  orderSearchTerms,
  parseOrderSearch,
  parsePages,
  ORDER_FILTER_EMPTY,
  ORDER_FILTER_LABELS,
  orderFilterSpec,
  orderFilterTabs,
  orderFilterValue,
  parseOrderFilter,
  rateFilterOwnShopsOnly,
} from "@/lib/order-filter-rules";
import { isOrderStatus, orderValuePaise } from "@/lib/order-rules";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { bagsText } from "@/lib/words";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await requireUser();
  const sp = await searchParams;
  // The tab is in the address (?show=rate), so Home cards can open the matching list.
  const filter = parseOrderFilter(sp.show, user.role);
  const spec = orderFilterSpec(filter);
  const showPrice = canSeePrice(user.role);
  // Search and "Load more" are for staff; a shop's own login sees few orders.
  const q = showPrice ? parseOrderSearch(sp.q) : "";
  const pages = parsePages(sp.n);
  const shownCount = pages * ORDER_PAGE_SIZE;
  // Every word must match the shop name, place, phone, or the start of the order number.
  const searchWhere = orderSearchTerms(q).map((term) => {
    const like = `%${escapeLike(term)}%`;
    return or(
      ilike(retailers.name, like),
      ilike(retailers.place, like),
      ilike(retailers.phone, like),
      isOrderIdTerm(term) ? ilike(sql`${orders.id}::text`, `${term}%`) : undefined,
    );
  });

  const [own] = await db
    .select({ id: retailers.id })
    .from(retailers)
    .where(eq(retailers.userId, user.id))
    .limit(1);
  const scope = orderListScope(user.role, own?.id ?? null);

  const found =
    scope.kind === "none"
      ? []
      : await db
          .select({
            id: orders.id,
            bags: orders.bags,
            ratePaise: orders.ratePaise,
            status: orders.status,
            createdAt: orders.createdAt,
            retailer: retailers.name,
            product: products.name,
          })
          .from(orders)
          .innerJoin(retailers, eq(orders.retailerId, retailers.id))
          .innerJoin(products, eq(orders.productId, products.id))
          .where(
            and(
              scope.kind === "retailer" ? eq(orders.retailerId, scope.retailerId) : undefined,
              spec.statuses ? inArray(orders.status, spec.statuses) : undefined,
              spec.rate === "missing" ? isNull(orders.ratePaise) : spec.rate === "filled" ? isNotNull(orders.ratePaise) : undefined,
              // "Rate to fill" is the sales person's own shops, the same number Home shows.
              rateFilterOwnShopsOnly(user.role, filter) ? eq(orders.salesRepId, user.id) : undefined,
              ...searchWhere,
            ),
          )
          .orderBy(desc(orders.createdAt), desc(orders.id))
          // One extra row tells whether there is more to load.
          .limit(shownCount + 1);
  const hasMore = found.length > shownCount;
  const rows = found.slice(0, shownCount);

  // Truck loads: the amount counts each load at its own rate (staff only), and a cancelled
  // order shows how many bags went out.
  const loads =
    rows.length > 0
      ? await db
          .select({ orderId: dispatches.orderId, bags: dispatches.bags, ratePaise: dispatches.ratePaise })
          .from(dispatches)
          .where(inArray(dispatches.orderId, rows.map((r) => r.id)))
      : [];
  const loadsOf = (id: string) => loads.filter((l) => l.orderId === id);
  const valueOf = (o: (typeof rows)[number]) => orderValuePaise({ ...o, loads: loadsOf(o.id) });
  const sentOf = (id: string) => loadsOf(id).reduce((n, l) => n + l.bags, 0);

  const canPlace = canPlaceOrder(user.role);
  const show = orderFilterValue(filter, user.role);
  const tabs = orderFilterTabs(user.role).map((f) => ({ value: orderFilterValue(f, user.role), label: ORDER_FILTER_LABELS[f] }));

  return (
    <>
      <div className="mb-4">
        <PageHeader title="Orders" />
      </div>
      <div className="mb-3">
        <FilterTabs path="/orders" param="show" value={show} tabs={tabs} label="Show orders" extra={{ q }} />
      </div>
      {showPrice && (
        <form method="get" action="/orders" role="search" className="mb-4 flex flex-col gap-1">
          {show && <input type="hidden" name="show" value={show} />}
          <div className="flex gap-2">
            <Input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search shop, phone or order"
              aria-label="Search orders"
              autoComplete="off"
              maxLength={60}
              enterKeyHint="search"
            />
            <Button type="submit" variant="outline" className="h-12">
              Search
            </Button>
          </div>
          {q && (
            <div>
              <TextLink href={buildOrdersHref(show, "")} replace scroll={false}>
                Clear
              </TextLink>
            </div>
          )}
        </form>
      )}
      {rows.length === 0 ? (
        <EmptyState title={q ? "No match" : ORDER_FILTER_EMPTY[filter]} />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((o, i) => (
            <li key={o.id}>
              <ListCard
                index={i}
                href={`/orders/${o.id}`}
                title={o.retailer}
                top={isOrderStatus(o.status) && <StatusChip status={o.status} />}
                bottom={
                  <>
                    <div>
                      <div className="tabular text-2xl font-bold">{bagsText(o.bags)}</div>
                      <div className="text-xs text-muted-foreground">
                        {o.product} · {formatDate(o.createdAt)}
                      </div>
                      {cancelledNote(o.status, o.bags, sentOf(o.id)) && (
                        <div className="text-xs text-muted-foreground">{cancelledNote(o.status, o.bags, sentOf(o.id))}</div>
                      )}
                    </div>
                    {showPrice && valueOf(o) !== null && (
                      <div className="tabular text-lg font-semibold">{formatINR(valueOf(o) ?? 0, { hidePaise: true })}</div>
                    )}
                  </>
                }
              />
            </li>
          ))}
          {hasMore && (
            <li>
              <Link
                href={buildOrdersHref(show, q, pages + 1)}
                replace
                scroll={false}
                className={cn(buttonVariants({ variant: "outline" }), "h-12 w-full")}
              >
                Load more
              </Link>
            </li>
          )}
        </ul>
      )}
      {canPlace && (
        <PinnedAction>
          <Link href="/orders/new" className={cn(buttonVariants(), "w-full")}>
            New order
          </Link>
        </PinnedAction>
      )}
    </>
  );
}
