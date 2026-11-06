import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { FilterTabs } from "@/components/app/filter-tabs";
import { PageHeader } from "@/components/app/page-header";
import { PinnedAction } from "@/components/app/pinned-action";
import { TextLink } from "@/components/app/text-link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { orders, retailers } from "@/db/schema";
import { canPlaceOrder, canSeePrice, orderListScope } from "@/lib/order-access";
import {
  buildOrdersHref,
  hasScopeTabs,
  ORDER_PAGE_SIZE,
  ORDER_FILTER_EMPTY,
  ORDER_FILTER_LABELS,
  orderDetailHref,
  orderFilterSpec,
  orderFilterTabs,
  orderFilterValue,
  parseOrderFilter,
  parseOrdersListState,
  rateFilterOwnShopsOnly,
} from "@/lib/order-filter-rules";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { getOrderLoads, OrderCard, orderSearchWhere, selectOrderCards } from "./order-list";
import { ScopedOrders } from "./scoped-orders";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await requireUser();
  const state = parseOrdersListState(await searchParams, user.role);
  const showPrice = canSeePrice(user.role);
  const canPlace = canPlaceOrder(user.role);
  // A sales person gets Mine / All and status groups, except the focused "Rate to fill" list Home opens.
  if (hasScopeTabs(user.role) && state.show !== "rate") {
    return <ScopedOrders userId={user.id} state={state} scope={state.scope ?? "mine"} showPrice={showPrice} canPlace={canPlace} />;
  }
  const focused = hasScopeTabs(user.role);
  // The tab is in the address (?show=rate), so Home cards can open the matching list.
  const { show, q } = state;
  const filter = parseOrderFilter(show, user.role);
  const spec = orderFilterSpec(filter);
  const pages = state.n;
  const shownCount = pages * ORDER_PAGE_SIZE;

  const [own] = await db
    .select({ id: retailers.id })
    .from(retailers)
    .where(eq(retailers.userId, user.id))
    .limit(1);
  const scope = orderListScope(user.role, own?.id ?? null);

  const found =
    scope.kind === "none"
      ? []
      : await selectOrderCards()
          .where(
            and(
              scope.kind === "retailer" ? eq(orders.retailerId, scope.retailerId) : undefined,
              spec.statuses ? inArray(orders.status, spec.statuses) : undefined,
              spec.rate === "missing" ? isNull(orders.ratePaise) : spec.rate === "filled" ? isNotNull(orders.ratePaise) : undefined,
              // "Rate to fill" is the sales person's own shops, the same number Home shows.
              rateFilterOwnShopsOnly(user.role, filter) ? eq(orders.salesRepId, user.id) : undefined,
              ...orderSearchWhere(q),
            ),
          )
          .orderBy(desc(orders.createdAt), desc(orders.id))
          // One extra row tells whether there is more to load.
          .limit(shownCount + 1);
  const hasMore = found.length > shownCount;
  const rows = found.slice(0, shownCount);
  const loads = await getOrderLoads(rows.map((r) => r.id));

  const tabs = orderFilterTabs(user.role).map((f) => ({ value: orderFilterValue(f, user.role), label: ORDER_FILTER_LABELS[f] }));

  return (
    <>
      <div className="mb-4">
        <PageHeader title={focused ? ORDER_FILTER_LABELS.rate : "Orders"} back={focused ? "/orders" : undefined} />
      </div>
      {!focused && (
        <div className="mb-3">
          <FilterTabs path="/orders" param="show" value={show} tabs={tabs} label="Show orders" extra={{ q }} />
        </div>
      )}
      {showPrice && !focused && (
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
              <TextLink href={buildOrdersHref({ show })} replace scroll={false}>
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
              <OrderCard order={o} loads={loads} href={orderDetailHref(o.id, state)} index={i} showPrice={showPrice} />
            </li>
          ))}
          {hasMore && (
            <li>
              <Link
                href={buildOrdersHref({ ...state, n: pages + 1 })}
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
