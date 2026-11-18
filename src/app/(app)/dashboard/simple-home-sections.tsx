import {
  BadgeCheck,
  Building2,
  ChevronRight,
  ClipboardList,
  IndianRupee,
  Package,
  PackagePlus,
  Phone,
  Receipt,
  ShoppingCart,
  Store,
  Tag,
  TrendingUp,
  TriangleAlert,
  Truck,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react";
import Link from "next/link";
import { ActionTile, HomeHeading, HomeStat, RowCard, TodoRow } from "@/components/app/action-tile";
import { CallButton } from "@/components/app/call-button";
import { EmptyState } from "@/components/app/empty-state";
import { StatusChip } from "@/components/app/status-chip";
import { isOrderStatus } from "@/lib/order-rules";
import {
  getAccountsHome,
  getAdminHome,
  getLogisticsHome,
  getMyCash,
  getRetailerHome,
  getSalesHome,
} from "@/lib/home-stats";
import { NO_LIMIT_FILTER, NO_REP_FILTER } from "@/lib/home-rules";
import { formatINR, formatINRCompact } from "@/lib/money";
import { getCashWithStaff, getMoneyToday, getOwnerMonth, getOwnerRisk, getOwnerToday, getTopOverdue } from "@/lib/owner-home";
import { cashAgePill, deltaPct, homeWindows, supplierValue } from "@/lib/owner-home-rules";
import { overridesMonthText } from "@/lib/credit-check-rules";
import { rangeQuery } from "@/lib/report-range";
import { getSuppliers } from "@/lib/suppliers";
import { cn } from "@/lib/utils";
import { daysText, formatCount, shopsText } from "@/lib/words";

const num = (v: number) => new Intl.NumberFormat("en-IN").format(v);
const money = (p: number) => formatINR(p, { hidePaise: true });
const short = (p: number) => (Math.abs(p) >= 1_00_000_00 ? formatINRCompact(p) : money(p));

/* =========================================================================
   1. SALES SCREEN (Exact Match to Image 2)
   ========================================================================= */

export async function SimpleSalesHome({ userId }: { userId: string }) {
  const [s, cash] = await Promise.all([getSalesHome(userId), getMyCash(userId)]);
  const collect = (s.collect ?? []).slice(0, 3);
  const moreShops = s.retailersWithDues - collect.length;

  return (
    <div className="flex flex-col gap-6">
      {/* Every daily job is a button here (owner rule: never only in the bottom bar). */}
      <div className="grid grid-cols-2 gap-3">
        <ActionTile href="/orders/new" title="New order" icon={ShoppingCart} color="blue" />
        <ActionTile href="/receipts/new" title="Collect payment" icon={IndianRupee} color="green" />
        <ActionTile href="/orders" title="My orders" icon={ClipboardList} color="violet" />
        <ActionTile href="/ledger" title="Shop dues" icon={Store} color="rose" />
      </div>

      {/* Only while there is something to do. */}
      <RowCard>
        {s.pendingRate > 0 && (
          <TodoRow
            href="/orders?show=rate"
            icon={Tag}
            color="amber"
            title={s.pendingRate === 1 ? "1 order needs a rate" : `${num(s.pendingRate)} orders need a rate`}
          />
        )}
        {cash.heldPaise > 0 && <TodoRow href="/wallet" icon={Wallet} color="green" title="Cash to hand over" value={money(cash.heldPaise)} />}
      </RowCard>

      {/* Who to collect from: most overdue first. Tap the shop to take a payment, the phone to call. */}
      {collect.length > 0 && (
        <div className="flex flex-col gap-2">
          <HomeHeading>Collect from</HomeHeading>
          <RowCard>
            {collect.map((r) => (
              <CollectRow key={r.retailerId} row={r} />
            ))}
            {moreShops > 0 && (
              <Link href="/ledger" className="flex min-h-12 items-center justify-center text-sm font-semibold text-primary active:bg-muted">
                {num(moreShops)} more {moreShops === 1 ? "shop" : "shops"}
              </Link>
            )}
          </RowCard>
        </div>
      )}
    </div>
  );
}

/** One shop that owes money. The row opens the payment form for it; the phone dials the shop. */
function CollectRow({ row }: { row: { retailerId: string; name: string; phone: string; duePaise: number; overduePaise: number; daysPastTerms?: number } }) {
  const late = row.overduePaise > 0;
  return (
    <div className="relative flex min-h-16 items-center gap-2 py-2 pr-2 pl-4">
      <div className="flex min-w-0 flex-1 flex-col">
        <Link
          href={`/receipts/new?retailer=${row.retailerId}`}
          className="truncate text-base font-semibold outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
        >
          {row.name}
        </Link>
        {late && <span className="text-xs font-medium text-rose-600">Late by {daysText(row.daysPastTerms ?? 0)}</span>}
      </div>
      <span className="tabular shrink-0 text-lg font-bold">{money(row.duePaise)}</span>
      <CallButton phone={row.phone} shop={row.name} className="relative z-10 size-12 text-emerald-700" />
    </div>
  );
}

/* Words for a count: "1 order to send", "3 orders to send". */
const orderWord = (n: number, rest: string) => `${num(n)} ${n === 1 ? "order" : "orders"} ${rest}`;

/* =========================================================================
   2. LOGISTICS HOME
   ========================================================================= */

export async function SimpleLogisticsHome({ userId }: { userId: string }) {
  const [s, cash] = await Promise.all([getLogisticsHome(), getMyCash(userId)]);
  const toSend = s.ready + s.partly;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3">
        <ActionTile href="/dispatch" title="Send goods" icon={Truck} color="blue" />
        <ActionTile href="/stock/purchase" title="New purchase" icon={PackagePlus} color="amber" />
        <ActionTile href="/stock" title="Stock" icon={Package} color="violet" />
        <ActionTile href="/trucks" title="Trucks" icon={Warehouse} color="slate" />
        <ActionTile href="/receipts/new" title="Collect payment" icon={IndianRupee} color="green" />
        <ActionTile href="/orders" title="Orders" icon={ClipboardList} color="rose" />
      </div>

      <Waiting>
        {toSend > 0 && <TodoRow href="/dispatch" icon={Truck} color="blue" title={orderWord(toSend, "to send")} />}
        {s.trucks.length > 0 && (
          <TodoRow
            href="/trucks?tab=loaded"
            icon={Warehouse}
            color="slate"
            title={s.trucks.length === 1 ? "1 truck is loaded" : `${num(s.trucks.length)} trucks are loaded`}
          />
        )}
        {cash.heldPaise > 0 && <TodoRow href="/wallet" icon={Wallet} color="green" title="Cash to hand over" value={money(cash.heldPaise)} />}
      </Waiting>
    </div>
  );
}

/** The "Waiting for you" card. Shows nothing at all when no row is given. */
function Waiting({ title = "Waiting for you", children }: { title?: string; children: React.ReactNode }) {
  const rows = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <HomeHeading>{title}</HomeHeading>
      <RowCard>{rows}</RowCard>
    </div>
  );
}

/* =========================================================================
   3. ACCOUNTS HOME
   ========================================================================= */

export async function SimpleAccountsHome() {
  const [s, today] = await Promise.all([getAccountsHome(), getMoneyToday(homeWindows(new Date())).catch(() => null)]);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3">
        <ActionTile href="/approvals" title="Approve orders" icon={BadgeCheck} color="blue" />
        <ActionTile href="/receipts" title="Payments" icon={Receipt} color="green" />
        <ActionTile href="/wallet" title="Cash from staff" icon={Wallet} color="amber" />
        <ActionTile href="/ledger" title="Shop dues" icon={Store} color="rose" />
      </div>

      <Waiting>
        {s.approvals > 0 && <TodoRow href="/approvals" icon={BadgeCheck} color="blue" title={orderWord(s.approvals, "to approve")} />}
        {s.unverifiedOnline > 0 && (
          <TodoRow
            href="/receipts/review"
            icon={Receipt}
            color="green"
            title={s.unverifiedOnline === 1 ? "1 online payment to check" : `${num(s.unverifiedOnline)} online payments to check`}
          />
        )}
        {s.handoversToConfirm > 0 && (
          <TodoRow
            href="/wallet"
            icon={Wallet}
            color="amber"
            title={s.handoversToConfirm === 1 ? "1 cash handover to receive" : `${num(s.handoversToConfirm)} cash handovers to receive`}
            value={money(s.cashToConfirmPaise)}
          />
        )}
      </Waiting>

      {today && (
        <div className="flex flex-col gap-2">
          <HomeHeading>Today</HomeHeading>
          <div className="grid grid-cols-2 gap-3">
            <HomeStat label="Collected" value={short(today.collectedPaise)} href="/receipts" />
            <HomeStat label="Total dues" value={short(today.duesPaise)} href="/ledger" />
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   4. SHOP (RETAILER) HOME
   ========================================================================= */

export async function SimpleRetailerHome({ userId }: { userId: string }) {
  const s = await getRetailerHome(userId);
  if (!s) return <EmptyState title="No shop is linked to this login" />;
  const owes = s.balancePaise > 0;
  const repPhone = s.salesRep && /^\d{10}$/.test(s.salesRep.phone) ? s.salesRep.phone : null;
  const o = s.lastOrder;
  const left = o ? Math.max(o.bags - o.sentBags, 0) : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* What the shop owes comes first: it is the one number they open the app for. */}
      <Link href="/ledger" className="flex flex-col rounded-2xl bg-card px-4 py-3 shadow-card ring-1 ring-foreground/6 active:bg-muted">
        <span className="text-sm text-muted-foreground">{owes ? "You have to pay" : s.balancePaise < 0 ? "Paid in advance" : "Nothing to pay"}</span>
        {s.balancePaise !== 0 && <span className="tabular text-3xl leading-tight font-bold">{money(Math.abs(s.balancePaise))}</span>}
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <ActionTile href="/orders/new" title="New order" icon={ShoppingCart} color="blue" />
        <ActionTile href="/orders" title="My orders" icon={ClipboardList} color="violet" />
        <ActionTile href="/ledger" title="My account" icon={Store} color="rose" />
        {repPhone && <ActionTile href={`tel:+91${repPhone}`} title="Call sales person" icon={Phone} color="green" />}
      </div>

      {o && (
        <div className="flex flex-col gap-2">
          <HomeHeading>Your last order</HomeHeading>
          <RowCard>
            <Link href={`/orders/${o.id}`} className="flex min-h-16 items-center gap-3 px-4 py-2 active:bg-muted">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-base font-semibold">
                  {num(o.bags)} bags {o.productName}
                </span>
                {o.sentBags > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {num(o.sentBags)} sent{left > 0 ? `, ${num(left)} to come` : ""}
                  </span>
                )}
              </span>
              {isOrderStatus(o.status) && <StatusChip status={o.status} />}
              <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground/60" />
            </Link>
          </RowCard>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   5. OWNER HOME: today's numbers, what needs attention, then the daily screens.
   The detail (month, risk, top overdue, cash with staff, suppliers) is on /business.
   ========================================================================= */

export async function SimpleAdminHome() {
  const now = new Date();
  const w = homeWindows(now);
  const [today, risk, cashStaff, todo] = await Promise.all([
    getOwnerToday(w).catch(() => null),
    getOwnerRisk(w, now).catch(() => null),
    getCashWithStaff(now).catch(() => null),
    getAdminHome().catch(() => null),
  ]);
  const dash = "\u2014";
  const staffCash = cashStaff ? cashStaff.reduce((acc, p) => acc + p.heldPaise, 0) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <HomeHeading>Today</HomeHeading>
        <div className="grid grid-cols-2 gap-3">
          <HomeStat label="Sold" value={today ? `${num(today.bags)} bags` : dash} href="/reports" />
          <HomeStat label="Collected" value={today ? short(today.collected.totalPaise) : dash} href="/receipts" />
          <HomeStat label="Total dues" value={risk ? short(risk.outstandingPaise) : dash} href="/ledger" />
          <HomeStat label="Cash with staff" value={staffCash === null ? dash : short(staffCash)} href="/wallet" />
        </div>
      </div>

      <Waiting title="Needs your attention">
        {todo && todo.approvals > 0 && <TodoRow href="/approvals" icon={BadgeCheck} color="blue" title={orderWord(todo.approvals, "to approve")} />}
        {todo && todo.toDispatch > 0 && <TodoRow href="/dispatch" icon={Truck} color="blue" title={orderWord(todo.toDispatch, "to send")} />}
        {todo && todo.unverifiedOnline > 0 && (
          <TodoRow
            href="/receipts/review"
            icon={Receipt}
            color="green"
            title={todo.unverifiedOnline === 1 ? "1 online payment to check" : `${num(todo.unverifiedOnline)} online payments to check`}
          />
        )}
        {risk && risk.overdueShops > 0 && (
          <TodoRow
            href="/ledger"
            icon={TriangleAlert}
            color="rose"
            title={risk.overdueShops === 1 ? "1 shop is late paying" : `${num(risk.overdueShops)} shops are late paying`}
            value={short(risk.overduePaise)}
          />
        )}
        {todo && todo.shopsWithoutSalesRep > 0 && (
          <TodoRow
            href={`/retailers?filter=${NO_REP_FILTER}`}
            icon={Users}
            color="amber"
            title={todo.shopsWithoutSalesRep === 1 ? "1 shop has no sales person" : `${num(todo.shopsWithoutSalesRep)} shops have no sales person`}
          />
        )}
        {risk && risk.noLimitShops > 0 && (
          <TodoRow
            href={`/retailers?filter=${NO_LIMIT_FILTER}`}
            icon={Store}
            color="amber"
            title={risk.noLimitShops === 1 ? "1 shop has no credit limit" : `${num(risk.noLimitShops)} shops have no credit limit`}
          />
        )}
      </Waiting>

      <div className="grid grid-cols-2 gap-3">
        <ActionTile href="/business" title="Business overview" icon={TrendingUp} color="blue" />
        <ActionTile href="/orders" title="Orders" icon={ClipboardList} color="violet" />
        <ActionTile href="/retailers" title="Shops" icon={Store} color="rose" />
        <ActionTile href="/trucks" title="Trucks" icon={Truck} color="slate" />
      </div>
    </div>
  );
}

/* =========================================================================
   6. BUSINESS OVERVIEW (owner only, /business): month, accounts, risk, overdue, staff cash, suppliers
   ========================================================================= */

export async function BusinessOverview() {
  const now = new Date();
  const w = homeWindows(now);

  const [today, month, risk, cashStaff, suppliersList, topOverdue] = await Promise.all([
    getOwnerToday(w).catch(() => null),
    getOwnerMonth(w).catch(() => null),
    getOwnerRisk(w, now).catch(() => null),
    getCashWithStaff(now).catch(() => []),
    getSuppliers().catch(() => []),
    getTopOverdue(w).catch(() => []),
  ]);

  const salesPaise = today?.salesPaise ?? 0;
  const bags = today?.bags ?? 0;
  const todayPurchasePaise = today?.purchasePaise ?? 0;
  const todayPurchaseBags = today?.purchaseBags ?? 0;
  const todayTotalCollected = today?.collected.totalPaise ?? 0;
  const todayCash = today?.collected.cashPaise ?? 0;
  const todayOnline = today?.collected.onlinePaise ?? 0;

  const monthSalesPaise = month?.sales.paise ?? 0;
  const monthBags = month?.sales.bags ?? 0;
  const monthPurchasePaise = month?.purchase.paise ?? 0;
  const monthPurchaseBags = month?.purchase.bags ?? 0;
  const marginPaise = month?.margin.paise ?? 0;
  const marginPerBag = month?.margin.perBagPaise ?? null;
  const salesDelta = month ? deltaPct(month.sales.paise, month.prevSales.paise) : null;

  const marketDues = risk?.outstandingPaise ?? 0;
  const overduePct = risk?.overduePct ?? 0;
  const totalStaffCash = cashStaff.reduce((acc, p) => acc + p.heldPaise, 0);
  const totalSupplierPayable = suppliersList.reduce((acc, s) => acc + s.balancePaise, 0);
  const topSupplier = suppliersList[0];


  return (
    <div className="flex flex-col gap-5 font-sans">
      {/* 1. TOP HERO CARD (Detailed Business & 4 Key Accounts) */}
      <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-xs">
        {/* Today's Sales Header */}
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-semibold text-muted-foreground">Today&apos;s Sales:</span>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="text-3xl font-black tracking-tight text-foreground">
                {money(salesPaise)}
              </span>
              <span className="text-sm font-semibold text-muted-foreground">
                ({num(bags)} bags)
              </span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs font-semibold text-muted-foreground">Month Margin:</span>
            <p className="mt-1 text-lg font-black text-emerald-600 dark:text-emerald-400">
              {money(marginPaise)}
            </p>
          </div>
        </div>

        {/* Collected & Purchased Today Strips */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-1 rounded-xl bg-muted/40 px-3.5 py-2 text-xs">
          <span className="font-semibold text-muted-foreground">
            Collected Today: <strong className="text-foreground">{money(todayTotalCollected)}</strong>
          </span>
          <span className="text-muted-foreground text-[11px]">
            Cash: <strong className="text-foreground">{money(todayCash)}</strong> &middot; Online: <strong className="text-foreground">{money(todayOnline)}</strong>
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-1 rounded-xl bg-blue-500/8 px-3.5 py-2 text-xs">
          <span className="font-semibold text-muted-foreground">
            Today&apos;s Purchase: <strong className="text-foreground">{short(todayPurchasePaise)}</strong> ({num(todayPurchaseBags)} bags)
          </span>
          <span className="text-muted-foreground text-[11px]">
            Month Purchase: <strong className="text-foreground">{short(monthPurchasePaise)}</strong> ({num(monthPurchaseBags)} bags)
          </span>
        </div>

        {/* HAR EK ACCOUNT KA DATA (4 Key Account Balances) */}
        <div className="mt-4 border-t border-border/60 pt-3.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
              Accounts &amp; Ledger Summary
            </span>
            <span className="text-[11px] font-semibold text-muted-foreground">
              Total Market &amp; Plant Balances
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {/* 1. Market Dues (Retailers Khata) */}
            <Link
              href="/ledger"
              className="group flex flex-col justify-between rounded-2xl border border-border/70 bg-muted/20 p-3 transition-colors hover:bg-muted/40 hover:border-primary/30"
            >
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Store className="size-3.5 text-blue-600 dark:text-blue-400" />
                  Market Dues
                </span>
                <ChevronRight className="size-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </div>
              <span className="mt-2 text-base font-black tracking-tight text-foreground">
                {short(marketDues)}
              </span>
              <span className="mt-0.5 text-[11px] font-medium text-muted-foreground truncate">
                {overduePct > 0 ? `${overduePct}% Overdue` : "Shops receivable"}
              </span>
            </Link>

            {/* 2. Factory / Supplier Account (Prism Cement etc.) */}
            <Link
              href="/suppliers"
              className="group flex flex-col justify-between rounded-2xl border border-border/70 bg-muted/20 p-3 transition-colors hover:bg-muted/40 hover:border-primary/30"
            >
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Building2 className="size-3.5 text-amber-600 dark:text-amber-400" />
                  Factory / Plant
                </span>
                <ChevronRight className="size-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </div>
              <span className="mt-2 text-base font-black tracking-tight text-foreground">
                {short(totalSupplierPayable)}
              </span>
              <span className="mt-0.5 text-[11px] font-medium text-muted-foreground truncate">
                {topSupplier ? `${topSupplier.name}` : "Supplier balance"}
              </span>
            </Link>

            {/* 3. Staff Cash in Hand */}
            <Link
              href="/wallet"
              className="group flex flex-col justify-between rounded-2xl border border-border/70 bg-muted/20 p-3 transition-colors hover:bg-muted/40 hover:border-primary/30"
            >
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Wallet className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                  Staff Cash
                </span>
                <ChevronRight className="size-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </div>
              <span className="mt-2 text-base font-black tracking-tight text-foreground">
                {money(totalStaffCash)}
              </span>
              <span className="mt-0.5 text-[11px] font-medium text-muted-foreground truncate">
                {cashStaff.length > 0 ? `${cashStaff.length} staff holding` : "All deposited"}
              </span>
            </Link>

            {/* 4. Bank & Online Collections */}
            <Link
              href="/receipts/review"
              className="group flex flex-col justify-between rounded-2xl border border-border/70 bg-muted/20 p-3 transition-colors hover:bg-muted/40 hover:border-primary/30"
            >
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Receipt className="size-3.5 text-indigo-600 dark:text-indigo-400" />
                  Online / Bank
                </span>
                <ChevronRight className="size-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </div>
              <span className="mt-2 text-base font-black tracking-tight text-foreground">
                {money(month?.collected.onlinePaise ?? 0)}
              </span>
              <span className="mt-0.5 text-[11px] font-medium text-muted-foreground truncate">This month, online</span>
            </Link>
          </div>
        </div>

        {/* Month Sales & Per-Bag Margin Summary */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-1 border-t border-border/50 pt-3 text-xs text-muted-foreground">
          <span>
            Month Sales: <strong className="text-foreground">{short(monthSalesPaise)}</strong> ({num(monthBags)} bags)
          </span>
          <div className="flex items-center gap-2">
            {marginPerBag !== null && (
              <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                {money(marginPerBag)}/bag
              </span>
            )}
            {salesDelta !== null && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                <TrendingUp className="size-3" />
                {salesDelta >= 0 ? `+${salesDelta}%` : `${salesDelta}%`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 4. RISK, RECOVERY & STOCK METRICS (4 Metric Cards + Risk Alerts) */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-extrabold text-foreground">Business Health &amp; Risk</h2>
          <Link href="/ledger?show=overdue" className="text-xs font-bold text-primary hover:underline">
            Ledger Audit
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <Link
            href="/ledger"
            className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-3.5 shadow-xs transition-colors hover:bg-muted/40"
          >
            <span className="text-xs font-semibold text-muted-foreground">Market Dues</span>
            <span className="mt-1 text-lg font-black text-foreground">{short(marketDues)}</span>
            <span className="text-[11px] text-muted-foreground font-medium">All retail credit</span>
          </Link>

          <Link
            href="/ledger?show=overdue"
            className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-3.5 shadow-xs transition-colors hover:bg-muted/40"
          >
            <span className="text-xs font-semibold text-muted-foreground">Overdue %</span>
            <span className={cn("mt-1 text-lg font-black", overduePct > 20 ? "text-rose-600 dark:text-rose-400" : "text-foreground")}>
              {overduePct}%
            </span>
            <span className="text-[11px] text-muted-foreground font-medium">Payments delayed</span>
          </Link>

          <div className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-3.5 shadow-xs">
            <span className="text-xs font-semibold text-muted-foreground">DSO (Collection Speed)</span>
            <span className="mt-1 text-lg font-black text-foreground">
              {!risk || risk.dso === null ? "\u2014" : daysText(risk.dso)}
            </span>
            <span className="text-[11px] text-muted-foreground font-medium">Average days</span>
          </div>

          <Link
            href="/stock"
            className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-3.5 shadow-xs transition-colors hover:bg-muted/40"
          >
            <span className="text-xs font-semibold text-muted-foreground">Stock Value</span>
            <span className="mt-1 text-lg font-black text-foreground">
              {short(risk?.stock.valuePaise ?? 0)}
            </span>
            <span className="text-[11px] text-muted-foreground font-medium">
              {risk?.stock && risk.stock.unvaluedBags > 0 ? `${formatCount(risk.stock.unvaluedBags)} bags no cost` : "Godown & trucks"}
            </span>
          </Link>
        </div>

        {/* Policy & Risk Alerts */}
        {risk && risk.noLimitShops > 0 && (
          <Link
            href={`/retailers?filter=${NO_LIMIT_FILTER}`}
            className="flex min-h-12 items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs font-bold text-amber-900 dark:text-amber-200 transition-colors hover:bg-amber-500/15"
          >
            <TriangleAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="flex-1">
              {shopsText(risk.noLimitShops)} {risk.noLimitShops === 1 ? "has" : "have"} no credit limit set
            </span>
            <ChevronRight className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          </Link>
        )}

        {risk && risk.overrides.count > 0 && (
          <Link
            href={`/reports/overrides?${rangeQuery(w.mtd)}`}
            className="flex min-h-12 items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs font-bold text-amber-900 dark:text-amber-200 transition-colors hover:bg-amber-500/15"
          >
            <TriangleAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="flex-1">{overridesMonthText(risk.overrides)}</span>
            <ChevronRight className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          </Link>
        )}
      </div>

      {/* 5. TOP OVERDUE SHOPS (Quick Call & Recovery Feed) */}
      {topOverdue.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-extrabold text-foreground">Top Overdue Recovery</h2>
            <Link href="/ledger?show=overdue" className="text-xs font-bold text-primary hover:underline">
              View All ({topOverdue.length})
            </Link>
          </div>

          <div className="flex flex-col gap-2">
            {topOverdue.slice(0, 4).map((r) => (
              <Link
                key={r.retailerId}
                href={`/ledger/${r.retailerId}`}
                className="flex items-center justify-between rounded-2xl border border-border/80 bg-card p-3.5 shadow-xs transition-colors hover:bg-muted/40"
              >
                <div>
                  <p className="text-sm font-bold text-foreground">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.daysPastTerms} days overdue</p>
                </div>
                <div className="text-right">
                  <span className="text-sm font-black text-rose-600 dark:text-rose-400">
                    {money(r.overduePaise)}
                  </span>
                  <span className="block text-[11px] font-semibold text-muted-foreground">Due</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 6. STAFF CASH WITH REPS */}
      {cashStaff.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-extrabold text-foreground">Cash with Staff</h2>
            <Link href="/wallet" className="text-xs font-bold text-primary hover:underline">
              Handover ({cashStaff.length})
            </Link>
          </div>

          <div className="flex flex-col gap-2">
            {cashStaff.map((p) => {
              const pill = cashAgePill(p.ageDays);
              return (
                <Link
                  key={p.personId}
                  href="/wallet"
                  className="flex items-center justify-between rounded-2xl border border-border/80 bg-card p-3.5 shadow-xs transition-colors hover:bg-muted/40"
                >
                  <div>
                    <p className="text-sm font-bold text-foreground">{p.name}</p>
                    <span className="text-[11px] text-muted-foreground">Sales Staff</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-foreground">{money(p.heldPaise)}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-extrabold",
                        pill.tone === "risk"
                          ? "bg-rose-500/15 text-rose-700 dark:text-rose-400"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {pill.text}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* 7. FACTORY / SUPPLIERS BALANCES */}
      {suppliersList.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-extrabold text-foreground">Factory Suppliers</h2>
            <Link href="/suppliers" className="text-xs font-bold text-primary hover:underline">
              View All ({suppliersList.length})
            </Link>
          </div>

          <div className="flex flex-col gap-2">
            {suppliersList.slice(0, 3).map((sup) => (
              <Link
                key={sup.id}
                href={`/suppliers/${sup.id}`}
                className="flex items-center justify-between rounded-2xl border border-border/80 bg-card p-3.5 shadow-xs transition-colors hover:bg-muted/40"
              >
                <div>
                  <p className="text-sm font-bold text-foreground">{sup.name}</p>
                  <p className="text-xs text-muted-foreground">{supplierValue(sup)}</p>
                </div>
                <div className="text-right">
                  <span className="text-sm font-black text-foreground">
                    {short(sup.balancePaise)}
                  </span>
                  <span className="block text-[11px] font-semibold text-muted-foreground">Balance</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
