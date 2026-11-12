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
  History,
  Package,
  PackagePlus,
  Receipt,
  ShoppingCart,
  Store,
  TrendingUp,
  TriangleAlert,
  Truck,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
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
import { getCashWithStaff, getOwnerMonth, getOwnerRisk, getOwnerToday, getTopOverdue } from "@/lib/owner-home";
import { cashAgePill, deltaPct, homeWindows, supplierValue } from "@/lib/owner-home-rules";
import { overridesMonthText } from "@/lib/credit-check-rules";
import { rangeQuery } from "@/lib/report-range";
import { getSuppliers } from "@/lib/suppliers";
import { cn } from "@/lib/utils";
import { bagsText, daysText, formatCount, shopsText } from "@/lib/words";

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
          <span className="text-lg font-black leading-none">â‚¹</span>
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
          <Link
            href="/receipts"
            className="group flex flex-col rounded-xl bg-muted/30 p-2.5 transition-all duration-150 hover:bg-muted/60 active:scale-[0.98] ring-1 ring-border/40 hover:ring-primary/30"
          >
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-semibold">Collected Today</span>
              <ChevronRight className="size-3 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
            </div>
            <span className="mt-0.5 text-sm font-black text-foreground">{money(s.collectedTodayPaise)}</span>
          </Link>
          <Link
            href="/ledger"
            className="group flex flex-col rounded-xl bg-muted/30 p-2.5 transition-all duration-150 hover:bg-muted/60 active:scale-[0.98] ring-1 ring-border/40 hover:ring-primary/30"
          >
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-semibold">My Shops Due</span>
              <ChevronRight className="size-3 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
            </div>
            <span className="mt-0.5 text-sm font-black text-rose-600 dark:text-rose-400">{money(s.duesPaise)}</span>
          </Link>
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
            gradient="bg-gradient-to-b from-blue-600 to-indigo-700"
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
            gradient="bg-gradient-to-b from-blue-600 to-indigo-700"
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
            href="/stock/transfer"
            line1="Move"
            line2="Bags"
            sub="Transfer"
            icon={Package}
            gradient="bg-gradient-to-b from-blue-600 to-slate-700"
          />
        </div>
      </div>

      {/* Current Orders (Top 3 waiting to dispatch) */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-foreground">Current Orders</h2>
          <Link href="/dispatch" className="text-xs font-bold text-primary hover:underline">
            View all
          </Link>
        </div>

        {s.currentOrders.length > 0 ? (
          <div className="flex flex-col gap-2">
            {s.currentOrders.map((o) => {
              const location =
                o.deliverTo === "site"
                  ? o.siteAddress
                    ? `Site: ${o.siteAddress}`
                    : "Site delivery"
                  : o.retailerPlace;
              return (
                <Link
                  key={o.id}
                  href={`/orders/${o.id}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card p-3.5 shadow-xs transition-all duration-150 hover:border-primary/40 active:scale-[0.99]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-extrabold text-foreground">
                        {o.retailerName}
                      </p>
                      {isOrderStatus(o.status) && <StatusChip status={o.status} />}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {location}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-foreground">
                      {o.productName} ?{" "}
                      <span className="font-extrabold text-orange-600 dark:text-orange-400">
                        {num(o.remainingBags)} bags left
                      </span>
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-20 items-center justify-center rounded-2xl border border-dashed border-border/80 bg-muted/20 text-xs font-medium text-muted-foreground">
            No orders waiting to dispatch
          </div>
        )}
      </div>

      {/* Godown Stock (Product-wise breakdown) */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-foreground">
            Godown Stock ({num(s.godown.bags)} bags)
          </h2>
          <Link href="/godowns" className="text-xs font-bold text-primary hover:underline">
            All godowns
          </Link>
        </div>

        {s.godown.products.length > 0 ? (
          <div className="divide-y divide-border/50 rounded-2xl border border-border/80 bg-card shadow-xs">
            {s.godown.products.map((p) => (
              <div
                key={p.productId}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <span className="font-semibold text-foreground">{p.name}</span>
                <span className="shrink-0 font-extrabold text-foreground">
                  {num(p.bags)} bags
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-20 items-center justify-center rounded-2xl border border-dashed border-border/80 bg-muted/20 text-xs font-medium text-muted-foreground">
            No stock in godowns
          </div>
        )}
      </div>

      {/* Loaded Trucks (Stock on Wheels) */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-foreground">Loaded Trucks (Stock on Wheels)</h2>
          <Link href="/trucks?tab=loaded" className="text-xs font-bold text-primary hover:underline">
            Fleet View ({s.trucks.length})
          </Link>
        </div>

        {s.trucks.length > 0 ? (
          <div className="flex flex-col gap-2">
            {s.trucks.map((t) => (
              <div
                key={t.truck}
                className="rounded-2xl border border-border/80 bg-card p-4 shadow-xs"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-semibold uppercase text-muted-foreground">
                      Truck Registration
                    </span>
                    <p className="text-base font-black text-foreground">{t.truck}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Link
                      href="/stock/transfer"
                      className="inline-flex min-h-9 items-center justify-center rounded-xl border border-border bg-muted/60 px-2.5 py-1 text-xs font-bold text-foreground transition-all duration-150 hover:bg-muted active:scale-95"
                    >
                      Unload
                    </Link>
                    <Link
                      href="/dispatch"
                      className="inline-flex min-h-9 items-center justify-center rounded-xl bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary transition-all duration-150 hover:bg-primary/20 active:scale-95"
                    >
                      Dispatch
                    </Link>
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-border/50 pt-2.5">
                  {t.products.map((p) => (
                    <span
                      key={p.name}
                      className="inline-flex items-center rounded-lg bg-muted/60 px-2.5 py-1 text-xs font-semibold text-foreground"
                    >
                      {p.name} ? {num(p.bags)} bags
                    </span>
                  ))}
                </div>
              </div>
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
          <Link
            href="/wallet"
            className="group flex flex-col rounded-xl bg-muted/30 p-2.5 transition-all duration-150 hover:bg-muted/60 active:scale-[0.98] ring-1 ring-border/40 hover:ring-primary/30"
          >
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-semibold">Staff Cash to Verify</span>
              <ChevronRight className="size-3 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
            </div>
            <span className="mt-0.5 text-sm font-black text-emerald-600 dark:text-emerald-400">{money(s.cashToConfirmPaise)}</span>
          </Link>
          <Link
            href="/receipts/review"
            className="group flex flex-col rounded-xl bg-muted/30 p-2.5 transition-all duration-150 hover:bg-muted/60 active:scale-[0.98] ring-1 ring-border/40 hover:ring-primary/30"
          >
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-semibold">Online to Reconcile</span>
              <ChevronRight className="size-3 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
            </div>
            <span className="mt-0.5 text-sm font-black text-blue-600 dark:text-blue-400">{s.unverifiedOnline} payments</span>
          </Link>
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
            gradient="bg-gradient-to-b from-blue-600 to-indigo-700"
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
            line2="Ledger"
            sub="Statement & Bills"
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
   5. ADMIN / OWNER SCREEN (Detailed Accounts, Master Management & Operations)
   ========================================================================= */

export async function SimpleAdminHome() {
  const now = new Date();
  const w = homeWindows(now);

  const [today, month, risk, cashStaff, suppliersList, adminHome, topOverdue] = await Promise.all([
    getOwnerToday(w).catch(() => null),
    getOwnerMonth(w).catch(() => null),
    getOwnerRisk(w, now).catch(() => null),
    getCashWithStaff(now).catch(() => []),
    getSuppliers().catch(() => []),
    getAdminHome().catch(() => null),
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

  const pendingApprovals = adminHome?.approvals ?? 0;
  const pendingDispatch = adminHome?.toDispatch ?? 0;
  const pendingOnline = adminHome?.unverifiedOnline ?? 0;
  const unassignedShops = adminHome?.shopsWithoutSalesRep ?? 0;
  const totalPendingWork = pendingApprovals + pendingDispatch + pendingOnline + unassignedShops;

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
            Cash: <strong className="text-foreground">{money(todayCash)}</strong> Â· Online: <strong className="text-foreground">{money(todayOnline)}</strong>
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
              <span className="mt-0.5 text-[11px] font-medium text-muted-foreground truncate">
                {pendingOnline > 0 ? `${pendingOnline} to verify` : "Month online"}
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
                â‚¹{money(marginPerBag)}/bag
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

      {/* 2. PENDING TO-DO & ACTION QUEUE (Approvals, Dispatch, Verification) */}
      {totalPendingWork > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">
              Needs Attention ({totalPendingWork})
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {pendingApprovals > 0 && (
              <Link
                href="/approvals"
                className="flex items-center justify-between rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 transition-colors hover:bg-amber-500/15"
              >
                <div>
                  <span className="text-xs font-black text-amber-800 dark:text-amber-300">Approvals</span>
                  <p className="text-[11px] text-muted-foreground">Credit &amp; rates</p>
                </div>
                <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-black text-amber-950">
                  {pendingApprovals}
                </span>
              </Link>
            )}

            {pendingDispatch > 0 && (
              <Link
                href="/dispatch"
                className="flex items-center justify-between rounded-2xl border border-blue-500/30 bg-blue-500/10 p-3 transition-colors hover:bg-blue-500/15"
              >
                <div>
                  <span className="text-xs font-black text-blue-800 dark:text-blue-300">Dispatch</span>
                  <p className="text-[11px] text-muted-foreground">Orders to send</p>
                </div>
                <span className="rounded-full bg-blue-500 px-2 py-0.5 text-xs font-black text-white">
                  {pendingDispatch}
                </span>
              </Link>
            )}

            {pendingOnline > 0 && (
              <Link
                href="/receipts/review"
                className="flex items-center justify-between rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-3 transition-colors hover:bg-indigo-500/15"
              >
                <div>
                  <span className="text-xs font-black text-indigo-800 dark:text-indigo-300">Verify UPI</span>
                  <p className="text-[11px] text-muted-foreground">Online receipts</p>
                </div>
                <span className="rounded-full bg-indigo-500 px-2 py-0.5 text-xs font-black text-white">
                  {pendingOnline}
                </span>
              </Link>
            )}

            {unassignedShops > 0 && (
              <Link
                href={`/retailers?filter=${NO_REP_FILTER}`}
                className="flex items-center justify-between rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 transition-colors hover:bg-rose-500/15"
              >
                <div>
                  <span className="text-xs font-black text-rose-800 dark:text-rose-300">Unassigned</span>
                  <p className="text-[11px] text-muted-foreground">No sales rep</p>
                </div>
                <span className="rounded-full bg-rose-500 px-2 py-0.5 text-xs font-black text-white">
                  {unassignedShops}
                </span>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* 3. QUICK ACTIONS (Reports-focused 2x2 Grid) */}
      <div>
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-foreground">Quick Actions</h2>
          <Link href="/stock/purchase" className="text-xs font-bold text-primary hover:underline">
            + Record Purchase
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <QuickActionTile
            href={`/reports/purchases?from=${w.today}&to=${w.today}`}
            line1="Purchase"
            line2="Report"
            sub={todayPurchaseBags > 0 ? `${short(todayPurchasePaise)} Â· ${num(todayPurchaseBags)} bags` : "Truck journey & CSV"}
            icon={PackagePlus}
            gradient="bg-gradient-to-br from-blue-600 to-indigo-700"
          />

          <QuickActionTile
            href={`/reports/sales?from=${w.today}&to=${w.today}`}
            line1="Dispatch"
            line2="Report"
            sub={bags > 0 ? `${short(salesPaise)} Â· ${num(bags)} bags` : "Register & CSV"}
            icon={Truck}
            gradient="bg-gradient-to-br from-sky-600 to-blue-700"
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
            href="/reports"
            line1="All Reports"
            line2="& CSV"
            sub="Profit, Stock & Dues"
            icon={FileSpreadsheet}
            gradient="bg-gradient-to-br from-emerald-600 to-emerald-700"
          />
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
              {!risk || risk.dso === null ? "â€”" : daysText(risk.dso)}
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

      {/* 8. MASTER MANAGEMENT & SETTINGS (6 Touch-Friendly Control Cards) */}
      <div>
        <h2 className="mb-2.5 text-sm font-extrabold text-foreground">Master Management &amp; Settings</h2>
        <div className="grid grid-cols-2 gap-2.5">
          <Link
            href="/users"
            className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card p-3.5 shadow-xs transition-all hover:bg-muted/40 hover:border-primary/30"
          >
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Users className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-foreground">Staff &amp; Users</p>
              <p className="text-[11px] text-muted-foreground truncate">Roles &amp; Logins</p>
            </div>
          </Link>

          <Link
            href="/trucks"
            className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card p-3.5 shadow-xs transition-all hover:bg-muted/40 hover:border-primary/30"
          >
            <div className="flex size-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <Truck className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-foreground">Transport Fleet</p>
              <p className="text-[11px] text-muted-foreground truncate">Trucks &amp; Drivers</p>
            </div>
          </Link>

          <Link
            href="/godowns"
            className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card p-3.5 shadow-xs transition-all hover:bg-muted/40 hover:border-primary/30"
          >
            <div className="flex size-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Warehouse className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-foreground">Godowns</p>
              <p className="text-[11px] text-muted-foreground truncate">Warehouses &amp; Stock</p>
            </div>
          </Link>

          <Link
            href="/catalogue"
            className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card p-3.5 shadow-xs transition-all hover:bg-muted/40 hover:border-primary/30"
          >
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Package className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-foreground">Catalogue &amp; Rates</p>
              <p className="text-[11px] text-muted-foreground truncate">PPC, OPC &amp; Bags</p>
            </div>
          </Link>

          <Link
            href="/bank-accounts"
            className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card p-3.5 shadow-xs transition-all hover:bg-muted/40 hover:border-primary/30"
          >
            <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Receipt className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-foreground">Bank &amp; QR</p>
              <p className="text-[11px] text-muted-foreground truncate">UPI &amp; Accounts</p>
            </div>
          </Link>

          <Link
            href="/activity"
            className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card p-3.5 shadow-xs transition-all hover:bg-muted/40 hover:border-primary/30"
          >
            <div className="flex size-10 items-center justify-center rounded-xl bg-slate-500/10 text-slate-600 dark:text-slate-400">
              <History className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-foreground">Audit Trail</p>
              <p className="text-[11px] text-muted-foreground truncate">Activity &amp; Changes</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
