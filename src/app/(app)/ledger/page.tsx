import { asc, eq } from "drizzle-orm";
import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/app/empty-state";
import { FilterTabs } from "@/components/app/filter-tabs";
import { ListCard } from "@/components/app/list-card";
import { OverdueRow } from "@/components/app/overdue-row";
import { PageHeader } from "@/components/app/page-header";
import { SectionCaption } from "@/components/app/section-caption";
import { TextLink } from "@/components/app/text-link";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { retailers, walletMovements } from "@/db/schema";
import { getAllBalances } from "@/lib/ledger";
import { balanceLine } from "@/lib/ledger-view-rules";
import { formatINR } from "@/lib/money";
import { getOverdueRows } from "@/lib/overdue";
import {
  filterOverdue,
  minDaysParam,
  OVERDUE_MAX_ROWS,
  OVERDUE_MIN_DAYS,
  OVERDUE_PAGE_SIZE,
  overdueEmptyTitle,
  overdueLimitParam,
  overdueSummary,
  shopScope,
} from "@/lib/overdue-rules";
import { param } from "@/lib/report-range";
import { hasAnyRole, hasRole } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { walletBalance } from "@/lib/wallet-rules";
import { shopsText } from "@/lib/words";
import { ownRetailerId } from "./access";

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function LedgerPage({ searchParams }: { searchParams: Search }) {
  const { user } = await requireUser();
  const staff = hasAnyRole(user.role, ["accounts", "sales"]);
  const isRetailer = hasRole(user.role, "retailer");
  const header = <PageHeader title={staff ? "Dues" : "Ledger"} />;
  const empty = (title: string) => (
    <div className="flex flex-col gap-4">
      {header}
      <EmptyState title={title} />
    </div>
  );
  if (!staff && !isRetailer) return empty("No access");

  const sp = await searchParams;
  const scope = staff ? shopScope(user.role, user.id) : null;
  const show = param(sp.show) === "overdue" ? "overdue" : "all";

  let cashInHandPaise = 0;
  if (staff) {
    const movements = await db
      .select({ amountPaise: walletMovements.amountPaise, kind: walletMovements.kind })
      .from(walletMovements)
      .where(eq(walletMovements.collectorId, user.id));
    cashInHandPaise = walletBalance(movements).balancePaise;
  }
  const tabs = scope && (
    <FilterTabs
      path="/ledger"
      param="show"
      value={show === "overdue" ? "overdue" : ""}
      label="Show"
      tabs={[
        { value: "", label: "All" },
        { value: "overdue", label: "Overdue" },
      ]}
    />
  );
  const cashCard = staff && (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6">
      <div>
        <div className="text-xs font-medium text-muted-foreground">My cash in hand</div>
        <div className="tabular text-2xl font-bold">{formatINR(cashInHandPaise)}</div>
      </div>
      <Link href="/wallet" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        {cashInHandPaise > 0 ? "Hand over cash" : "Wallet"}
      </Link>
    </div>
  );

  if (scope && show === "overdue") {
    return (
      <div className="flex flex-col gap-4">
        {header}
        {cashCard}
        {tabs}
        <OverdueList sp={sp} scope={scope} userId={user.id} />
      </div>
    );
  }

  const own = staff ? null : await ownRetailerId(user.id);
  if (!staff && !own) return empty("Your login is not linked to a retailer");

  const balances = await getAllBalances();
  const list = await db
    .select({ id: retailers.id, name: retailers.name, place: retailers.place })
    .from(retailers)
    .where(own ? eq(retailers.id, own) : undefined)
    .orderBy(asc(retailers.name));

  // A shop with one login sees one ledger: go straight to it.
  if (own && list.length === 1) redirect(`/ledger/${list[0].id}`);
  if (list.length === 0) return empty("No retailers yet");
  return (
    <div className="flex flex-col gap-4">
      {header}
      {cashCard}
      {tabs}
      <ul className="flex flex-col gap-3">
        {list.map((r, i) => {
          const line = balanceLine(balances.find((b) => b.retailerId === r.id)?.balancePaise ?? 0);
          return (
            <li key={r.id}>
              <ListCard
                index={i}
                href={`/ledger/${r.id}`}
                title={r.place ? `${r.name} · ${r.place}` : r.name}
                bottom={
                  <>
                    <span className="text-xs text-muted-foreground">{line.label}</span>
                    <span className={`tabular text-lg font-bold ${line.label === "Advance" ? "text-green-700" : ""}`}>
                      {formatINR(line.amountPaise)}
                    </span>
                  </>
                }
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The collection call list. Sales people (without admin or accounts) only ever get their own shops:
 * their scope comes from `shopScope`, never from the address. Others pick Mine / All shops.
 */
async function OverdueList({
  sp,
  scope,
  userId,
}: {
  sp: Awaited<Search>;
  scope: { repId: string | null; canPickAll: boolean };
  userId: string;
}) {
  const mine = scope.canPickAll && param(sp.scope) === "mine";
  const repId = scope.canPickAll ? (mine ? userId : null) : scope.repId;
  const minDays = minDaysParam(sp.min);
  const limit = overdueLimitParam(sp.limit);
  const rows = filterOverdue(await getOverdueRows(), { minDays, repId });
  const summary = overdueSummary(rows);
  const shown = rows.slice(0, limit);
  const on = shown.filter((r) => r.active);
  const off = shown.filter((r) => !r.active);
  // Sales-only viewers collect; everyone else opens the statement.
  const href = (id: string) => (scope.canPickAll ? `/ledger/${id}` : `/receipts/new?retailer=${id}`);
  const keep = { scope: mine ? "mine" : "", min: minDays ? String(minDays) : "" };
  const more = new URLSearchParams({ limit: String(limit + OVERDUE_PAGE_SIZE) });
  for (const [k, v] of Object.entries(keep)) if (v) more.set(k, v);
  const list = (items: typeof shown) => (
    <ul className="flex flex-col gap-2">
      {items.map((r) => (
        <li key={r.retailerId}>
          <OverdueRow row={r} href={href(r.retailerId)} />
        </li>
      ))}
    </ul>
  );
  return (
    <>
      <div className="flex flex-col gap-2">
        {scope.canPickAll && (
          <FilterTabs
            path="/ledger"
            param="scope"
            value={mine ? "mine" : ""}
            label="Shops"
            extra={{ min: keep.min }}
            tabs={[
              { value: "mine", label: "Mine" },
              { value: "", label: "All shops" },
            ]}
          />
        )}
        {/* The picked one links to "" (no filter), so tapping it again clears it. */}
        <FilterTabs
          path="/ledger"
          param="min"
          value=""
          label="Days overdue"
          extra={{ scope: keep.scope }}
          tabs={OVERDUE_MIN_DAYS.map((d) => ({ value: d === minDays ? "" : String(d), label: `${d}+` }))}
        />
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={CircleCheck} tone="green" title={overdueEmptyTitle(minDays)} />
      ) : (
        <>
          <p className="tabular text-sm font-semibold">
            {formatINR(summary.overduePaise, { hidePaise: true })} overdue · {shopsText(summary.shops)}
          </p>
          {on.length > 0 && list(on)}
          {off.length > 0 && (
            <div className="flex flex-col gap-2">
              <SectionCaption>Off shops</SectionCaption>
              {list(off)}
            </div>
          )}
          {rows.length > shown.length && limit < OVERDUE_MAX_ROWS && (
            <TextLink href={`/ledger?${more}`} scroll={false} className="self-center">
              Show more
            </TextLink>
          )}
        </>
      )}
    </>
  );
}
