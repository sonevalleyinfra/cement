import {
  ArrowUpRight,
  BadgeAlert,
  BadgeCheck,
  Building2,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Coins,
  FileSpreadsheet,
  HandCoins,
  Package,
  PackagePlus,
  Receipt,
  ShoppingCart,
  Store,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/app/empty-state";
import {
  getAccountsHome,
  getAdminHome,
  getLogisticsHome,
  getMyCash,
  getRetailerHome,
  getSalesHome,
} from "@/lib/home-stats";
import { formatINR, formatINRCompact } from "@/lib/money";
import { getCashWithStaff, getOwnerMonth, getOwnerRisk, getOwnerToday } from "@/lib/owner-home";
import { deltaPct, homeWindows } from "@/lib/owner-home-rules";
import { getSuppliers } from "@/lib/suppliers";
import { cn } from "@/lib/utils";
import { bagsText, formatCount } from "@/lib/words";

const num = (v: number) => new Intl.NumberFormat("en-IN").format(v);
const money = (p: number) => formatINR(p, { hidePaise: true });
const short = (p: number) => (Math.abs(p) >= 1_00_000_00 ? formatINRCompact(p) : money(p));

/* -------------------------------------------------------------------------
   Reusable Portrait Action Card (Exact match to Image 2: rounded-3xl, 
   top icon inside white/20 rounded-xl, 2-line bold text at bottom)
   ------------------------------------------------------------------------- */

interface QuickActionTileProps {
  href: string;
  line1: string;
  line2: string;
  sub?: string;
  icon: LucideIcon | "rupee";
  gradient: string;
}

function QuickActionTile({ href, line1, line2, sub, icon: Icon, gradient }: QuickActionTileProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex min-h-[142px] flex-col justify-between rounded-3xl p-3.5 text-white shadow-sm transition-all duration-200 active:scale-[0.98] hover:shadow-md hover:brightness-105",
        gradient,
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-xl bg-white/20 transition-transform group-hover:scale-105">
        {Icon === "rupee" ? (
          <span className="text-lg font-black leading-none">₹</span>
        ) : (
          <Icon className="size-5 text-white" strokeWidth={2.4} />
        )}
      </div>
      <div>
        <span className="text-sm font-black leading-tight block">
          {line1}
          <br />
          {line2}
        </span>
        {sub && (
          <span className="mt-1 block text-[11px] font-semibold text-white/80 truncate">
            {sub}
          </span>
        )}
      </div>
    </Link>
  );
}

/* =========================================================================
   1. SALES SCREEN (Exact Match to Image 2)
   ========================================================================= */

export async function SimpleSalesHome({ userId }: { userId: string }) {
  const [s, cash] = await Promise.all([
    getSalesHome(userId),
    getMyCash(userId),
  ]);

  return (
    <div className="flex flex-col gap-4 font-sans">
      {/* Top Hero: Cash in Hand Card with Handover pill */}
      <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-xs">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-semibold text-muted-foreground">Cash in Hand:</span>
            <p className="mt-0.5 text-3xl font-black tracking-tight text-foreground">
              {money(cash.heldPaise)}
            </p>
          </div>

          <Link
            href="/wallet"
            className="inline-flex items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 px-4 py-2.5 text-sm font-bold text-primary transition-all duration-150 active:scale-95 hover:bg-primary/15"
          >
            Handover
          </Link>
        </div>

        {/* Sales & Collection Breakdown */}
        <div className="mt-3.5 grid grid-cols-2 gap-2 border-t border-border/50 pt-3 text-xs">
          <div className="flex flex-col rounded-xl bg-muted/30 p-2.5">
            <span className="text-[11px] font-semibold text-muted-foreground">Collected Today</span>
            <span className="mt-0.5 text-sm font-black text-foreground">{money(s.collectedTodayPaise)}</span>
          </div>
          <div className="flex flex-col rounded-xl bg-muted/30 p-2.5">
            <span className="text-[11px] font-semibold text-muted-foreground">My Shops Due</span>
            <span className="mt-0.5 text-sm font-black text-rose-600 dark:text-rose-400">{money(s.duesPaise)}</span>
          </div>
        </div>

        <div className="mt-2.5 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            This Month: <strong className="text-foreground">{money(s.salesMonthPaise)}</strong> ({formatCount(s.bagsMonth)} bags)
          </span>
          <span>{s.retailersWithDues} shops owe dues</span>
        </div>
      </div>

      {/* Quick Actions (3 Vibrant Portrait Cards in a row) */}
      <div>
        <h2 className="mb-2.5 text-sm font-extrabold text-foreground">Quick Actions</h2>
        <div className="grid grid-cols-3 gap-2.5">
          <QuickActionTile
            href="/orders/new"
            line1="New"
            line2="Order"
            sub="Book cement"
            icon={ShoppingCart}
            gradient="bg-gradient-to-b from-orange-500 to-orange-600"
          />

          <QuickActionTile
            href="/receipts/new"
            line1="Collect"
            line2="Payment"
            sub="Cash / UPI"
            icon="rupee"
            gradient="bg-gradient-to-b from-emerald-500 to-emerald-600"
          />

          <QuickActionTile
            href="/ledger"
            line1="Shop"
            line2="Dues"
            sub={`${s.retailersWithDues} shops`}
            icon={Store}
            gradient="bg-gradient-to-b from-blue-600 to-blue-700"
          />
        </div>
      </div>

      {/* Recent Activity / Collect Today Feed */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-foreground">Collect Today</h2>
          <Link href="/ledger?show=overdue" className="text-xs font-bold text-primary hover:underline">
            View All
          </Link>
        </div>

        {s.collect && s.collect.length > 0 ? (
          <div className="flex flex-col gap-2">
            {s.collect.slice(0, 3).map((r) => (
              <Link
                key={r.retailerId}
                href={`/receipts/new?retailer=${r.retailerId}`}
                className="flex items-center justify-between rounded-2xl border border-border/80 bg-card p-3.5 shadow-xs transition-colors hover:bg-muted/40"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
                    <Store className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.place ?? "Retailer"}</p>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-sm font-extrabold text-rose-600 dark:text-rose-400">{money(r.duePaise)}</p>
                  <span className="text-[11px] font-semibold text-muted-foreground">Due</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex min-h-20 items-center justify-center rounded-2xl border border-dashed border-border/80 bg-muted/20 text-xs font-medium text-muted-foreground">
            No pending collections today
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   2. LOGISTICS SCREEN (Exact Match to Image 2: 3 Cards in a row)
   ========================================================================= */

export async function SimpleLogisticsHome() {
  const now = new Date();
  const s = await getLogisticsHome(now);

  return (
    <div className="flex flex-col gap-4 font-sans">
      {/* Top Hero: Fleet Status Card with Stock breakdown */}
      <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-xs">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-semibold text-muted-foreground">Loaded Trucks:</span>
            <p className="mt-0.5 text-3xl font-black tracking-tight text-foreground">
              {s.trucks.length} Trucks
            </p>
          </div>

          <Link
            href="/stock"
            className="inline-flex items-center justify-center rounded-2xl border border-border bg-muted/60 px-4 py-2.5 text-sm font-bold text-foreground transition-all duration-150 active:scale-95 hover:bg-muted"
          >
            Godown
          </Link>
        </div>

        {/* Stock & Fleet Breakdown */}
        <div className="mt-3.5 grid grid-cols-2 gap-2 border-t border-border/50 pt-3 text-xs">
          <div className="flex flex-col rounded-xl bg-muted/30 p-2.5">
            <span className="text-[11px] font-semibold text-muted-foreground">Godown Stock</span>
            <span className="mt-0.5 text-sm font-black text-foreground">{num(s.godown.bags)} bags</span>
          </div>
          <div className="flex flex-col rounded-xl bg-muted/30 p-2.5">
            <span className="text-[11px] font-semibold text-muted-foreground">Ready to Dispatch</span>
            <span className="mt-0.5 text-sm font-black text-orange-600 dark:text-orange-400">{s.ready} orders</span>
          </div>
        </div>

        <div className="mt-2.5 flex items-center justify-between text-xs text-muted-foreground">
          <span>Partly sent: <strong className="text-foreground">{s.partly} orders</strong></span>
          <span>Cover: <strong>{s.godown.coverDays ? `${s.godown.coverDays} days` : "Normal"}</strong></span>
        </div>
      </div>

      {/* Quick Actions (3 Vibrant Portrait Cards in a row) */}
      <div>
        <h2 className="mb-2.5 text-sm font-extrabold text-foreground">Quick Actions</h2>
        <div className="grid grid-cols-3 gap-2.5">
          <QuickActionTile
            href="/dispatch"
            line1="Dispatch"
            line2="Truck"
            sub={`${s.ready} ready`}
            icon={Truck}
            gradient="bg-gradient-to-b from-orange-500 to-orange-600"
          />

          <QuickActionTile
            href="/stock/purchase"
            line1="Factory"
            line2="Purchase"
            sub="Plant cement"
            icon={Warehouse}
            gradient="bg-gradient-to-b from-emerald-500 to-teal-600"
          />

          <QuickActionTile
            href="/stock"
            line1="Move"
            line2="Bags"
            sub="Transfer"
            icon={Package}
            gradient="bg-gradient-to-b from-blue-600 to-slate-700"
          />
        </div>
      </div>

      {/* Ready for Dispatch List */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-foreground">Ready for Dispatch</h2>
          <Link href="/dispatch" className="text-xs font-bold text-primary hover:underline">
            View All ({s.ready})
          </Link>
        </div>

        {s.trucks.length > 0 ? (
          <div className="flex flex-col gap-2">
            {s.trucks.map((t) => (
              <Link
                key={t.truck}
                href="/dispatch"
                className="flex items-center justify-between rounded-2xl border border-border/80 bg-card p-4 shadow-xs transition-colors hover:bg-muted/40"
              >
                <div>
                  <span className="text-[11px] font-semibold uppercase text-muted-foreground">Truck Registration</span>
                  <p className="text-base font-black text-foreground">{t.truck}</p>
                </div>
                <div className="text-right">
                  <span className="rounded-full bg-orange-500/15 px-3 py-1 text-xs font-extrabold text-orange-700 dark:text-orange-400">
                    {t.products.reduce((acc, p) => acc + p.bags, 0)} bags
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex min-h-20 items-center justify-center rounded-2xl border border-dashed border-border/80 bg-muted/20 text-xs font-medium text-muted-foreground">
            No loaded trucks waiting
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   3. ACCOUNTS SCREEN (Exact Match to Image 2: 3 Cards in a row)
   ========================================================================= */

export async function SimpleAccountsHome() {
  const s = await getAccountsHome();
  const totalWaiting = s.approvals + s.unverifiedOnline + s.handoversToConfirm;

  return (
    <div className="flex flex-col gap-4 font-sans">
      {/* Top Hero: Verification Status Card */}
      <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-xs">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-semibold text-muted-foreground">Pending Verification:</span>
            <p className="mt-0.5 text-3xl font-black tracking-tight text-foreground">
              {totalWaiting} Items
            </p>
          </div>

          <Link
            href="/approvals"
            className="inline-flex items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 px-4 py-2.5 text-sm font-bold text-primary transition-all duration-150 active:scale-95 hover:bg-primary/15"
          >
            Review
          </Link>
        </div>

        {/* Accounts Pending Breakdown */}
        <div className="mt-3.5 grid grid-cols-2 gap-2 border-t border-border/50 pt-3 text-xs">
          <div className="flex flex-col rounded-xl bg-muted/30 p-2.5">
            <span className="text-[11px] font-semibold text-muted-foreground">Staff Cash to Verify</span>
            <span className="mt-0.5 text-sm font-black text-emerald-600 dark:text-emerald-400">{money(s.cashToConfirmPaise)}</span>
          </div>
          <div className="flex flex-col rounded-xl bg-muted/30 p-2.5">
            <span className="text-[11px] font-semibold text-muted-foreground">Online to Reconcile</span>
            <span className="mt-0.5 text-sm font-black text-blue-600 dark:text-blue-400">{s.unverifiedOnline} payments</span>
          </div>
        </div>

        <div className="mt-2.5 flex items-center justify-between text-xs text-muted-foreground">
          <span>Orders to approve: <strong className="text-foreground">{s.approvals} orders</strong></span>
          <span>Cash requests: <strong>{s.handoversToConfirm} staff</strong></span>
        </div>
      </div>

      {/* Quick Actions (3 Vibrant Portrait Cards in a row) */}
      <div>
        <h2 className="mb-2.5 text-sm font-extrabold text-foreground">Quick Actions</h2>
        <div className="grid grid-cols-3 gap-2.5">
          <QuickActionTile
            href="/approvals"
            line1="Approve"
            line2="Orders"
            sub={`${s.approvals} waiting`}
            icon={BadgeCheck}
            gradient="bg-gradient-to-b from-emerald-500 to-emerald-600"
          />

          <QuickActionTile
            href="/receipts/review"
            line1="Verify"
            line2="Online"
            sub={`${s.unverifiedOnline} UPI`}
            icon={Receipt}
            gradient="bg-gradient-to-b from-blue-600 to-blue-700"
          />

          <QuickActionTile
            href="/wallet"
            line1="Cash"
            line2="Handover"
            sub={money(s.cashToConfirmPaise)}
            icon={Wallet}
            gradient="bg-gradient-to-b from-purple-600 to-purple-700"
          />
        </div>
      </div>

      {/* Pending Approvals List */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-foreground">Pending Approvals</h2>
          <Link href="/approvals" className="text-xs font-bold text-primary hover:underline">
            View All
          </Link>
        </div>

        <div className="flex flex-col gap-2">
          <Link
            href="/approvals"
            className="flex items-center justify-between rounded-2xl border border-border/80 bg-card p-3.5 shadow-xs transition-colors hover:bg-muted/40"
          >
            <div>
              <p className="text-sm font-bold text-foreground">Order Approvals</p>
              <p className="text-xs text-muted-foreground">Credit limit &amp; rate checks</p>
            </div>
            <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-400">
              {s.approvals} waiting
            </span>
          </Link>

          <Link
            href="/wallet"
            className="flex items-center justify-between rounded-2xl border border-border/80 bg-card p-3.5 shadow-xs transition-colors hover:bg-muted/40"
          >
            <div>
              <p className="text-sm font-bold text-foreground">Sales Staff Cash</p>
              <p className="text-xs text-muted-foreground">{s.handoversToConfirm} requests pending</p>
            </div>
            <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
              {money(s.cashToConfirmPaise)}
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   4. RETAILER SCREEN (Exact Match to Image 2: 3 Cards in a row)
   ========================================================================= */

export async function SimpleRetailerHome({ userId }: { userId: string }) {
  const s = await getRetailerHome(userId);
  if (!s) return <EmptyState title="No shop linked" />;

  const isDue = s.balancePaise > 0;

  return (
    <div className="flex flex-col gap-4 font-sans">
      {/* Top Hero: Balance Card with Pay Online button */}
      <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-xs">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-semibold text-muted-foreground">
              {isDue ? "Outstanding Dues:" : "Advance Balance:"}
            </span>
            <p
              className={cn(
                "mt-0.5 text-3xl font-black tracking-tight",
                isDue ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400",
              )}
            >
              {money(Math.abs(s.balancePaise))}
            </p>
          </div>

          <Link
            href="/receipts/new"
            className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-xs transition-all duration-150 active:scale-95 hover:bg-emerald-700"
          >
            Pay Online
          </Link>
        </div>

        {/* Payments Summary */}
        <div className="mt-3.5 flex items-center justify-between border-t border-border/50 pt-3 text-xs text-muted-foreground">
          <span>Open Orders: <strong className="text-foreground">{s.openOrders} orders</strong></span>
          {s.lastPayment && (
            <span>Last Payment: <strong className="text-emerald-600 dark:text-emerald-400">{money(s.lastPayment.totalPaise)}</strong></span>
          )}
        </div>
      </div>

      {/* Quick Actions (3 Vibrant Portrait Cards in a row) */}
      <div>
        <h2 className="mb-2.5 text-sm font-extrabold text-foreground">Quick Actions</h2>
        <div className="grid grid-cols-3 gap-2.5">
          <QuickActionTile
            href="/orders/new"
            line1="Order"
            line2="Cement"
            sub="PPC / OPC"
            icon={ShoppingCart}
            gradient="bg-gradient-to-b from-orange-500 to-orange-600"
          />

          <QuickActionTile
            href="/orders?show=open"
            line1="Track"
            line2="Delivery"
            sub={`${s.openOrders} active`}
            icon={Truck}
            gradient="bg-gradient-to-b from-emerald-500 to-emerald-600"
          />

          <QuickActionTile
            href="/ledger"
            line1="My"
            line2="Khata"
            sub="Ledger & Bills"
            icon={Store}
            gradient="bg-gradient-to-b from-blue-600 to-blue-700"
          />
        </div>
      </div>

      {/* Orders Status Feed */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-foreground">Active Deliveries</h2>
          <Link href="/orders?show=open" className="text-xs font-bold text-primary hover:underline">
            View All ({s.openOrders})
          </Link>
        </div>

        {s.openOrders > 0 ? (
          <Link
            href="/orders?show=open"
            className="flex items-center justify-between rounded-2xl border border-border/80 bg-card p-4 shadow-xs transition-colors hover:bg-muted/40"
          >
            <div>
              <p className="text-sm font-bold text-foreground">Order In Progress</p>
              <p className="text-xs text-muted-foreground">Truck dispatched / out for delivery</p>
            </div>
            <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
              Active
            </span>
          </Link>
        ) : (
          <div className="flex min-h-20 items-center justify-center rounded-2xl border border-dashed border-border/80 bg-muted/20 text-xs font-medium text-muted-foreground">
            No active orders right now
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   5. ADMIN / OWNER SCREEN (Detailed Accounts & Business Overview)
   ========================================================================= */

export async function SimpleAdminHome() {
  const now = new Date();
  const w = homeWindows(now);

  const [today, month, risk, cashStaff, suppliersList, adminHome] = await Promise.all([
    getOwnerToday(w).catch(() => null),
    getOwnerMonth(w).catch(() => null),
    getOwnerRisk(w, now).catch(() => null),
    getCashWithStaff(now).catch(() => []),
    getSuppliers().catch(() => []),
    getAdminHome().catch(() => null),
  ]);

  const salesPaise = today?.salesPaise ?? 0;
  const bags = today?.bags ?? 0;
  const todayTotalCollected = today?.collected.totalPaise ?? 0;
  const todayCash = today?.collected.cashPaise ?? 0;
  const todayOnline = today?.collected.onlinePaise ?? 0;

  const monthSalesPaise = month?.sales.paise ?? 0;
  const monthBags = month?.sales.bags ?? 0;
  const marginPaise = month?.margin.paise ?? 0;
  const marginPerBag = month?.margin.perBagPaise ?? null;
  const monthCollected = month?.collected.totalPaise ?? 0;
  const salesDelta = month ? deltaPct(month.sales.paise, month.prevSales.paise) : null;

  const marketDues = risk?.outstandingPaise ?? 0;
  const overduePct = risk?.overduePct ?? 0;
  const totalStaffCash = cashStaff.reduce((acc, p) => acc + p.heldPaise, 0);
  const totalSupplierPayable = suppliersList.reduce((acc, s) => acc + s.balancePaise, 0);
  const topSupplier = suppliersList[0];

  return (
    <div className="flex flex-col gap-4 font-sans">
      {/* Top Hero Card (Detailed Business & Accounts Overview) */}
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

        {/* Collected Today Strip */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-1 rounded-xl bg-muted/40 px-3.5 py-2 text-xs">
          <span className="font-semibold text-muted-foreground">
            Collected Today: <strong className="text-foreground">{money(todayTotalCollected)}</strong>
          </span>
          <span className="text-muted-foreground text-[11px]">
            Cash: <strong className="text-foreground">{money(todayCash)}</strong> · Online: <strong className="text-foreground">{money(todayOnline)}</strong>
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
              <span className="mt-0.5 text-[11px] font-medium text-muted-foreground truncate">
                {adminHome && adminHome.unverifiedOnline > 0 ? `${adminHome.unverifiedOnline} to verify` : "Month online"}
              </span>
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
                ₹{money(marginPerBag)}/bag
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

      {/* Quick Actions (Matching Image 2 style cards in a 2x2 grid with live stats) */}
      <div>
        <h2 className="mb-2.5 text-sm font-extrabold text-foreground">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3">
          <QuickActionTile
            href={`/reports/sales?from=${w.today}&to=${w.today}`}
            line1="Reports &"
            line2="Export"
            sub="Register & CSV"
            icon={FileSpreadsheet}
            gradient="bg-gradient-to-br from-orange-500 to-orange-600"
          />

          <QuickActionTile
            href="/suppliers"
            line1="Factory"
            line2="Supplier"
            sub={topSupplier ? `${topSupplier.name}` : "Prism Cement"}
            icon={Building2}
            gradient="bg-gradient-to-br from-amber-500 to-amber-600"
          />

          <QuickActionTile
            href="/retailers"
            line1="Shops &"
            line2="Credit"
            sub={`${short(marketDues)} due`}
            icon={Store}
            gradient="bg-gradient-to-br from-blue-600 to-blue-700"
          />

          <QuickActionTile
            href="/wallet"
            line1="Team &"
            line2="Stock"
            sub={`${money(totalStaffCash)} cash`}
            icon={Users}
            gradient="bg-gradient-to-br from-emerald-600 to-emerald-700"
          />
        </div>
      </div>

      {/* Risk & Collection Alert Card at bottom */}
      <Link
        href="/ledger?show=overdue"
        className="flex items-center justify-between rounded-2xl border border-border/80 bg-card p-4 shadow-xs transition-colors hover:bg-muted/40"
      >
        <div>
          <span className="text-xs font-semibold text-muted-foreground">Risk &amp; Collection Alert</span>
          <p className="mt-0.5 text-base font-extrabold text-foreground">
            Market Dues: <span className="text-foreground">{short(marketDues)}</span>
          </p>
        </div>

        {overduePct > 0 ? (
          <span className="inline-flex items-center rounded-full bg-rose-500 px-2.5 py-1 text-xs font-bold text-white shadow-xs">
            {overduePct}% Overdue
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
            All Clear
          </span>
        )}
      </Link>
    </div>
  );
}
