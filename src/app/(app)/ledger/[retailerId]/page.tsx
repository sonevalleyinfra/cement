import { eq } from "drizzle-orm";
import { ArrowDownLeft, ArrowUpRight, Calendar, CreditCard, RotateCcw, Truck, Wallet } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/app/empty-state";
import { FilterTabs } from "@/components/app/filter-tabs";
import { PageHeader } from "@/components/app/page-header";
import { TextLink } from "@/components/app/text-link";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { retailers, user as users, walletMovements } from "@/db/schema";
import { formatDate, formatDateTime, toISTDateKey } from "@/lib/datetime";
import { isUuid } from "@/lib/ids";
import { getEntries } from "@/lib/ledger";
import { newestFirstWithBalance } from "@/lib/ledger-rules";
import { balanceLine, ledgerRowsForViewer, type LedgerViewRow } from "@/lib/ledger-view-rules";
import { formatINR } from "@/lib/money";
import { isRetailerOnly } from "@/lib/order-access";
import { can } from "@/lib/permissions";
import { hasAnyRole } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { walletBalance } from "@/lib/wallet-rules";
import { mayViewLedger } from "../access";
import { LedgerActions } from "./ledger-actions";

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function RetailerLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ retailerId: string }>;
  searchParams?: Search;
}) {
  const { user } = await requireUser();
  const { retailerId } = await params;
  if (!isUuid(retailerId)) notFound();
  if (!(await mayViewLedger(user, retailerId))) notFound();

  const [retailer] = await db.select().from(retailers).where(eq(retailers.id, retailerId)).limit(1);
  if (!retailer) notFound();

  const staff = hasAnyRole(user.role, ["accounts", "sales"]);
  let cashInHandPaise = 0;
  if (staff) {
    const movements = await db
      .select({ amountPaise: walletMovements.amountPaise, kind: walletMovements.kind })
      .from(walletMovements)
      .where(eq(walletMovements.collectorId, user.id));
    cashInHandPaise = walletBalance(movements).balancePaise;
  }

  const rows = await getEntries(retailerId);
  const actors = new Map(
    (await db.select({ id: users.id, name: users.name }).from(users)).map((u) => [u.id, u.name]),
  );

  // Newest first; each row keeps its running balance.
  const withBalance = newestFirstWithBalance(rows);
  const balance = withBalance[0]?.balancePaise ?? 0;
  const sourceById = new Map(withBalance.map((r) => [r.id, r]));

  // A shop's own login sees no dispatch amounts and no running balance (owner's rule, ledger-view-rules).
  const entries = ledgerRowsForViewer(user.role, withBalance);
  const hasOpening = rows.some((r) => r.kind === "opening");

  // Period filtering: 'all' | 'today' | 'month' | 'year'
  const sp = (await searchParams) ?? {};
  const period = typeof sp.period === "string" ? sp.period : "all";

  const todayKey = toISTDateKey(new Date());
  const [y, m, d] = todayKey.split("-").map(Number);
  const prevDay = new Date(Date.UTC(y, m - 1, d - 1));
  const yesterdayKey = prevDay.toISOString().slice(0, 10);
  const currentMonthPrefix = todayKey.slice(0, 7);
  const currentYearPrefix = todayKey.slice(0, 4);

  const filteredEntries = entries.filter((e) => {
    if (period === "all" || !period) return true;
    const key = toISTDateKey(e.createdAt);
    if (period === "today") return key === todayKey;
    if (period === "month") return key.startsWith(currentMonthPrefix);
    if (period === "year") return key.startsWith(currentYearPrefix);
    return true;
  });

  // Calculate period summary metrics
  let periodDispatchedPaise = 0;
  let periodBags = 0;
  let periodPaymentsPaise = 0;
  let paymentCount = 0;
  let dispatchCount = 0;

  for (const e of filteredEntries) {
    const src = sourceById.get(e.id);
    if (!src) continue;

    if (src.kind === "order_debit") {
      if (src.amountPaise > 0) periodDispatchedPaise += src.amountPaise;
      if (src.bags) periodBags += src.bags;
      dispatchCount++;
    } else if (src.kind === "dispatch_reversal") {
      periodDispatchedPaise += src.amountPaise;
      if (src.bags) periodBags += src.bags;
    } else if (src.kind === "receipt_credit") {
      if (src.amountPaise < 0) {
        periodPaymentsPaise += Math.abs(src.amountPaise);
        paymentCount++;
      } else {
        periodPaymentsPaise -= src.amountPaise;
      }
    } else if (src.kind === "receipt_reversal") {
      periodPaymentsPaise -= src.amountPaise;
    }
  }

  // Group filtered entries Day by Day
  type DayGroup = {
    dateKey: string;
    date: Date;
    entries: LedgerViewRow[];
    dayDebitPaise: number;
    dayCreditPaise: number;
    dayBags: number;
  };

  const dayGroups: DayGroup[] = [];
  let curGroup: DayGroup | null = null;

  for (const e of filteredEntries) {
    const dateKey = toISTDateKey(e.createdAt);
    const src = sourceById.get(e.id);
    if (!curGroup || curGroup.dateKey !== dateKey) {
      curGroup = {
        dateKey,
        date: new Date(e.createdAt),
        entries: [],
        dayDebitPaise: 0,
        dayCreditPaise: 0,
        dayBags: 0,
      };
      dayGroups.push(curGroup);
    }
    curGroup.entries.push(e);
    if (e.amountPaise !== null) {
      if (e.amountPaise > 0) curGroup.dayDebitPaise += e.amountPaise;
      else if (e.amountPaise < 0) curGroup.dayCreditPaise += Math.abs(e.amountPaise);
    }
    if (src?.kind === "order_debit" && src.bags) {
      curGroup.dayBags += src.bags;
    }
  }

  function formatDayHeading(dateKey: string, date: Date): string {
    if (dateKey === todayKey) return "Today (" + formatDate(date) + ")";
    if (dateKey === yesterdayKey) return "Yesterday (" + formatDate(date) + ")";
    return formatDate(date);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={retailer.name}
        back={staff ? "/ledger" : undefined}
        action={isRetailerOnly(user.role) && <TextLink href="/receipts">Payments</TextLink>}
      />

      {staff && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6">
          <div>
            <div className="text-xs font-medium text-muted-foreground">My cash in hand</div>
            <div className="tabular text-2xl font-bold">{formatINR(cashInHandPaise)}</div>
          </div>
          <Link href="/wallet" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            {cashInHandPaise > 0 ? "Hand over cash" : "Wallet"}
          </Link>
        </div>
      )}

      {/* Main Total Balance Card */}
      <div className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6">
        <div className="text-xs text-muted-foreground">{balanceLine(balance).label}</div>
        <div className="tabular text-3xl font-bold">{formatINR(balanceLine(balance).amountPaise)}</div>
      </div>

      <LedgerActions
        retailerId={retailerId}
        canOpen={can(user.role, "setOpeningBalance") && !hasOpening}
        canAdjust={can(user.role, "adjustLedger")}
        canCollect={can(user.role, "recordReceipt")}
        duesPaise={balance > 0 ? balance : 0}
      />

      {/* Period Filter Tabs */}
      <div className="flex flex-col gap-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
          Transaction Period
        </div>
        <FilterTabs
          path={`/ledger/${retailerId}`}
          param="period"
          value={period === "all" ? "" : period}
          label="Transaction Period"
          tabs={[
            { value: "", label: "All time" },
            { value: "today", label: "Today" },
            { value: "month", label: "This Month" },
            { value: "year", label: "This Year" },
          ]}
        />
      </div>

      {/* Period Summary Stats */}
      {filteredEntries.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-card p-3 shadow-card ring-1 ring-foreground/6 border-l-4 border-l-rose-500">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{staff ? "Cement Billed" : "Cement Received"}</span>
              <Truck className="h-3.5 w-3.5 text-rose-500" />
            </div>
            <div className="mt-1 text-base font-bold text-rose-600 tabular">
              {staff ? formatINR(periodDispatchedPaise) : `${periodBags} bags`}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {staff && periodBags > 0 ? `${periodBags} bags · ` : ""}
              {dispatchCount} {dispatchCount === 1 ? "dispatch" : "dispatches"}
            </div>
          </div>

          <div className="rounded-2xl bg-card p-3 shadow-card ring-1 ring-foreground/6 border-l-4 border-l-emerald-500">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Payments</span>
              <CreditCard className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <div className="mt-1 text-base font-bold text-emerald-600 tabular">
              {formatINR(periodPaymentsPaise)}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {paymentCount} {paymentCount === 1 ? "payment" : "payments"}
            </div>
          </div>
        </div>
      )}

      {/* Day by Day Transactions List */}
      {filteredEntries.length === 0 ? (
        <EmptyState title={period === "all" || !period ? "No entries yet" : "No transactions in this period"} />
      ) : (
        <div className="flex flex-col gap-5">
          {dayGroups.map((group) => (
            <div key={group.dateKey} className="flex flex-col gap-2">
              {/* Day Header */}
              <div className="flex items-center justify-between px-1 border-b border-border/40 pb-1.5">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-bold text-foreground">
                    {formatDayHeading(group.dateKey, group.date)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    ({group.entries.length})
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] tabular">
                  {staff ? (
                    <>
                      {group.dayDebitPaise > 0 && (
                        <span className="font-semibold text-rose-600">
                          +{formatINR(group.dayDebitPaise)}
                        </span>
                      )}
                      {group.dayCreditPaise > 0 && (
                        <span className="font-semibold text-emerald-600">
                          -{formatINR(group.dayCreditPaise)}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      {group.dayBags > 0 && (
                        <span className="font-medium text-foreground/80">
                          {group.dayBags} bags
                        </span>
                      )}
                      {group.dayCreditPaise > 0 && (
                        <span className="font-semibold text-emerald-600">
                          -{formatINR(group.dayCreditPaise)}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Day Entries */}
              <ul className="flex flex-col gap-2">
                {group.entries.map((e) => {
                  const src = sourceById.get(e.id);
                  const isCredit = e.amountPaise !== null && e.amountPaise < 0;
                  const isDebit = e.amountPaise !== null && e.amountPaise > 0;

                  return (
                    <li
                      key={e.id}
                      className="flex flex-col gap-1.5 rounded-2xl bg-card p-3 shadow-card ring-1 ring-foreground/6 hover:ring-primary/20 transition-all"
                    >
                      {/* Top Row: Type Badge + Amount */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          {isCredit ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                              <ArrowDownLeft className="h-3 w-3" />
                              {e.label}
                            </span>
                          ) : src?.kind === "dispatch_reversal" ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                              <RotateCcw className="h-3 w-3" />
                              {e.label}
                            </span>
                          ) : src?.kind === "receipt_reversal" ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                              <RotateCcw className="h-3 w-3" />
                              {e.label}
                            </span>
                          ) : src?.kind === "opening" ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-slate-500/10 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                              <Wallet className="h-3 w-3" />
                              {e.label}
                            </span>
                          ) : isDebit ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
                              <ArrowUpRight className="h-3 w-3" />
                              {e.label}
                            </span>
                          ) : (
                            <span className="text-sm font-semibold">{e.label}</span>
                          )}
                        </div>

                        {e.amountPaise !== null && (
                          <span
                            className={cn(
                              "tabular text-sm font-bold",
                              isCredit ? "text-emerald-600" : isDebit ? "text-rose-600" : ""
                            )}
                          >
                            {isCredit
                              ? formatINR(e.amountPaise)
                              : `+${formatINR(e.amountPaise)}`}
                          </span>
                        )}
                      </div>

                      {/* Middle: What (Product & Bags) */}
                      {e.what && (
                        <div className="text-xs font-medium text-foreground/90 pl-0.5">
                          {e.what}
                        </div>
                      )}

                      {/* Bottom: Date/Time + Note + Actor + Running Balance */}
                      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground pt-0.5 border-t border-border/30">
                        <span className="truncate">
                          {e.backdated ? formatDate(e.createdAt) : formatDateTime(e.createdAt)}
                          {e.note ? ` · ${e.note}` : ""}
                          {e.actorId ? ` · ${actors.get(e.actorId) ?? ""}` : ""}
                        </span>
                        {e.balancePaise !== null && (
                          <span
                            className={cn(
                              "tabular shrink-0 whitespace-nowrap font-medium",
                              e.balancePaise < 0 ? "text-emerald-600" : "text-muted-foreground"
                            )}
                          >
                            {balanceLine(e.balancePaise).label}{" "}
                            {formatINR(balanceLine(e.balancePaise).amountPaise)}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
