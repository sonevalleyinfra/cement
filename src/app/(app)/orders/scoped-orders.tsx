import { and, count, desc, eq, inArray, or, type SQL } from "drizzle-orm";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { ChipCount, chipClass } from "@/components/app/chip";
import { EmptyState } from "@/components/app/empty-state";
import { GroupCaption } from "@/components/app/group-caption";
import { PageHeader } from "@/components/app/page-header";
import { PinnedAction } from "@/components/app/pinned-action";
import { TextLink } from "@/components/app/text-link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { orders, retailers } from "@/db/schema";
import {
  buildOrdersHref,
  DONE_ORDER_STATUSES,
  groupOrders,
  OPEN_ORDER_LIMIT,
  OPEN_ORDER_STATUSES,
  ORDER_PAGE_SIZE,
  orderDetailHref,
  orderGroupLabel,
  type OrdersListState,
  type OrderScope,
} from "@/lib/order-filter-rules";
import { cn } from "@/lib/utils";
import { getOrderLoads, OrderCard, type OrderCardRow, type OrderLoad, orderSearchWhere, selectOrderCards } from "./order-list";

const DONE_ID = "orders-done";

/** The orders list of a sales person: Mine / All, then the open orders by status, then Done. */
export async function ScopedOrders({
  userId,
  state,
  scope,
  showPrice,
  canPlace,
}: {
  userId: string;
  state: OrdersListState;
  scope: OrderScope;
  showPrice: boolean;
  canPlace: boolean;
}) {
  const { q } = state;
  const mineWhere = or(eq(orders.salesRepId, userId), eq(retailers.salesRepId, userId));
  const scopeWhere = scope === "mine" ? mineWhere : undefined;
  const searchWhere = orderSearchWhere(q);
  const countOrders = (...where: (SQL | undefined)[]) =>
    db
      .select({ n: count() })
      .from(orders)
      .innerJoin(retailers, eq(orders.retailerId, retailers.id))
      .where(and(...where));
  const isOpen = inArray(orders.status, [...OPEN_ORDER_STATUSES]);
  const isDone = inArray(orders.status, [...DONE_ORDER_STATUSES]);

  const showDone = state.done || q !== "";
  const shownDone = state.n * ORDER_PAGE_SIZE;
  const [openRows, doneRows, [doneTotal], [mineOpen], [allOpen]] = await Promise.all([
    selectOrderCards()
      .where(and(isOpen, scopeWhere, ...searchWhere))
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(OPEN_ORDER_LIMIT),
    showDone
      ? selectOrderCards()
          .where(and(isDone, scopeWhere, ...searchWhere))
          .orderBy(desc(orders.createdAt), desc(orders.id))
          // One extra row tells whether there is more to load.
          .limit(shownDone + 1)
      : Promise.resolve([]),
    countOrders(isDone, scopeWhere, ...searchWhere),
    // The two counts on Mine / All ignore the search.
    countOrders(isOpen, mineWhere),
    countOrders(isOpen),
  ]);
  const hasMoreDone = doneRows.length > shownDone;
  const shownDoneRows = doneRows.slice(0, shownDone);
  const loads = await getOrderLoads([...openRows, ...shownDoneRows].map((o) => o.id));
  const groups = groupOrders(openRows, scope);
  const nothing = openRows.length === 0 && doneTotal.n === 0;

  const cards = (rows: OrderCardRow[]) => (
    <OrderCards rows={rows} loads={loads} state={state} showPrice={showPrice} />
  );
  const scopes = [
    { value: "mine", label: "Mine", n: mineOpen.n },
    { value: "all", label: "All", n: allOpen.n },
  ] as const;

  return (
    <>
      <div className="mb-4">
        <PageHeader title="Orders" />
      </div>
      <nav aria-label="Whose orders" className="mb-4 grid grid-cols-2 gap-2">
        {scopes.map((s) => (
          <Link
            key={s.value}
            href={buildOrdersHref({ scope: s.value, q })}
            replace
            scroll={false}
            aria-current={scope === s.value ? "page" : undefined}
            className={chipClass(scope === s.value, "w-full")}
          >
            {s.label}
            <ChipCount n={s.n} on={scope === s.value} />
          </Link>
        ))}
      </nav>
      <form method="get" action="/orders" role="search" className="mb-4 flex flex-col gap-1">
        {scope === "all" && <input type="hidden" name="scope" value="all" />}
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
            <TextLink href={buildOrdersHref({ scope })} replace scroll={false}>
              Clear
            </TextLink>
          </div>
        )}
      </form>
      {nothing ? (
        q ? (
          <EmptyState
            title="No match"
            action={scope === "mine" && <TextLink href={buildOrdersHref({ scope: "all", q })}>Search all</TextLink>}
          />
        ) : (
          <EmptyState title={scope === "mine" ? "No orders yet" : "No orders"} />
        )
      ) : (
        <div className="flex flex-col gap-6">
          {openRows.length === 0 && !q && (
            <p className="py-8 text-center text-base font-medium text-muted-foreground">Nothing open</p>
          )}
          {groups.map((g) => (
            <section key={g.group} aria-labelledby={`orders-${g.group}`} className="flex flex-col gap-2">
              <GroupCaption id={`orders-${g.group}`} label={g.label} count={g.rows.length} />
              {cards(g.rows)}
            </section>
          ))}
          {doneTotal.n > 0 &&
            (q ? (
              <section aria-labelledby={DONE_ID} className="flex flex-col gap-2">
                <GroupCaption id={DONE_ID} label={orderGroupLabel("done", scope)} count={doneTotal.n} />
                {cards(shownDoneRows)}
                {hasMoreDone && <LoadMore href={buildOrdersHref({ ...state, n: state.n + 1 })} />}
              </section>
            ) : (
              <div className="flex flex-col gap-2">
                <Link
                  href={buildOrdersHref({ scope, done: !state.done })}
                  replace
                  scroll={false}
                  aria-expanded={state.done}
                  aria-controls={DONE_ID}
                  className="flex min-h-12 items-center justify-between rounded-2xl bg-card px-4 ring-1 ring-foreground/10 transition-transform duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
                >
                  <span className="flex items-center text-sm font-semibold">
                    {orderGroupLabel("done", scope)}
                    <ChipCount n={doneTotal.n} on={false} />
                  </span>
                  <ChevronDown
                    aria-hidden
                    className={cn("size-5 text-muted-foreground transition-transform duration-200 ease-out", state.done && "rotate-180")}
                  />
                </Link>
                <div id={DONE_ID} hidden={!state.done}>
                  {state.done && (
                    <div className="flex flex-col gap-3">
                      {cards(shownDoneRows)}
                      {hasMoreDone && <LoadMore href={buildOrdersHref({ ...state, n: state.n + 1 })} />}
                    </div>
                  )}
                </div>
              </div>
            ))}
        </div>
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

/** A group's cards; the stagger restarts in each group. */
function OrderCards({
  rows,
  loads,
  state,
  showPrice,
}: {
  rows: OrderCardRow[];
  loads: OrderLoad[];
  state: OrdersListState;
  showPrice: boolean;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((o, i) => (
        <li key={o.id}>
          <OrderCard order={o} loads={loads} href={orderDetailHref(o.id, state)} index={i} showPrice={showPrice} />
        </li>
      ))}
    </ul>
  );
}

function LoadMore({ href }: { href: string }) {
  return (
    <Link href={href} replace scroll={false} className={cn(buttonVariants({ variant: "outline" }), "h-12 w-full")}>
      Load more
    </Link>
  );
}
