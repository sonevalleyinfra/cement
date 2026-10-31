import {
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
import { getOwnerMonth, getOwnerRisk, getOwnerToday } from "@/lib/owner-home";
import { deltaPct, homeWindows } from "@/lib/owner-home-rules";
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
  icon: LucideIcon | "rupee";
  gradient: string;
}

function QuickActionTile({ href, line1, line2, icon: Icon, gradient }: QuickActionTileProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex min-h-[135px] flex-col justify-between rounded-3xl p-3.5 text-white shadow-sm transition-all duration-200 active:scale-[0.98] hover:shadow-md hover:brightness-105",
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
      <div className="flex items-center justify-between rounded-3xl border border-border/70 bg-card p-5 shadow-xs">
        <div>
          <span className="text-xs font-semibold text-muted-foreground">Cash in Hand:</span>
          <p className="mt-0.5 text-3xl font-black tracking-tight text-foreground">
            {money(cash.heldPaise)}
          </p>
          {cash.pendingPaise > 0 && (
            <p className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">
              {money(cash.pendingPaise)} waiting handover approval
            </p>
          )}
        </div>

        <Link
          href="/wallet"
          className="inline-flex items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 px-4 py-2.5 text-sm font-bold text-primary transition-all duration-150 active:scale-95 hover:bg-primary/15"
        >
          Handover
        </Link>
      </div>

      {/* Quick Actions (3 Vibrant Portrait Cards in a row) */}
      <div>
        <h2 className="mb-2.5 text-sm font-extrabold text-foreground">Quick Actions</h2>
        <div className="grid grid-cols-3 gap-2.5">
          <QuickActionTile
            href="/orders/new"
            line1="New"
            line2="Order"
            icon={ShoppingCart}
            gradient="bg-gradient-to-b from-orange-500 to-orange-600"
          />

          <QuickActionTile
            href="/receipts/new"
            line1="Collect"
            line2="Payment"
            icon="rupee"
            gradient="bg-gradient-to-b from-emerald-500 to-emerald-600"
          />

          <QuickActionTile
            href="/ledger"
            line1="Shop"
            line2="Dues"
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
      {/* Top Hero: Fleet Status Card with Stock pill */}
      <div className="flex items-center justify-between rounded-3xl border border-border/70 bg-card p-5 shadow-xs">
        <div>
          <span className="text-xs font-semibold text-muted-foreground">Loaded Trucks:</span>
          <p className="mt-0.5 text-3xl font-black tracking-tight text-foreground">
            {s.trucks.length} Trucks
          </p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            {num(s.godown.bags)} bags currently in godown
          </p>
        </div>

        <Link
          href="/stock"
          className="inline-flex items-center justify-center rounded-2xl border border-border bg-muted/60 px-4 py-2.5 text-sm font-bold text-foreground transition-all duration-150 active:scale-95 hover:bg-muted"
        >
          Godown
        </Link>
      </div>

      {/* Quick Actions (3 Vibrant Portrait Cards in a row - EXACT same as Image 2) */}
      <div>
        <h2 className="mb-2.5 text-sm font-extrabold text-foreground">Quick Actions</h2>
        <div className="grid grid-cols-3 gap-2.5">
          <QuickActionTile
            href="/dispatch"
            line1="Dispatch"
            line2="Truck"
            icon={Truck}
            gradient="bg-gradient-to-b from-orange-500 to-orange-600"
          />

          <QuickActionTile
            href="/stock/purchase"
            line1="Factory"
            line2="Purchase"
            icon={Warehouse}
            gradient="bg-gradient-to-b from-emerald-500 to-teal-600"
          />

          <QuickActionTile
            href="/stock"
            line1="Move"
            line2="Bags"
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
      <div className="flex items-center justify-between rounded-3xl border border-border/70 bg-card p-5 shadow-xs">
        <div>
          <span className="text-xs font-semibold text-muted-foreground">Pending Actions:</span>
          <p className="mt-0.5 text-3xl font-black tracking-tight text-foreground">
            {totalWaiting} Items
          </p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            Cash to confirm: {money(s.cashToConfirmPaise)}
          </p>
        </div>

        <Link
          href="/approvals"
          className="inline-flex items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 px-4 py-2.5 text-sm font-bold text-primary transition-all duration-150 active:scale-95 hover:bg-primary/15"
        >
          Review
        </Link>
      </div>

      {/* Quick Actions (3 Vibrant Portrait Cards in a row - EXACT same as Image 2) */}
      <div>
        <h2 className="mb-2.5 text-sm font-extrabold text-foreground">Quick Actions</h2>
        <div className="grid grid-cols-3 gap-2.5">
          <QuickActionTile
            href="/approvals"
            line1="Approve"
            line2="Orders"
            icon={BadgeCheck}
            gradient="bg-gradient-to-b from-emerald-500 to-emerald-600"
          />

          <QuickActionTile
            href="/receipts/review"
            line1="Verify"
            line2="Online"
            icon={Receipt}
            gradient="bg-gradient-to-b from-blue-600 to-blue-700"
          />

          <QuickActionTile
            href="/wallet"
            line1="Cash"
            line2="Handover"
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
      <div className="flex items-center justify-between rounded-3xl border border-border/70 bg-card p-5 shadow-xs">
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

      {/* Quick Actions (3 Vibrant Portrait Cards in a row - EXACT same as Image 2) */}
      <div>
        <h2 className="mb-2.5 text-sm font-extrabold text-foreground">Quick Actions</h2>
        <div className="grid grid-cols-3 gap-2.5">
          <QuickActionTile
            href="/orders/new"
            line1="Order"
            line2="Cement"
            icon={ShoppingCart}
            gradient="bg-gradient-to-b from-orange-500 to-orange-600"
          />

          <QuickActionTile
            href="/orders?show=open"
            line1="Track"
            line2="Delivery"
            icon={Truck}
            gradient="bg-gradient-to-b from-emerald-500 to-emerald-600"
          />

          <QuickActionTile
            href="/ledger"
            line1="My"
            line2="Khata"
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
   5. ADMIN / OWNER SCREEN (Cards matching Image 2 style)
   ========================================================================= */

export async function SimpleAdminHome() {
  const now = new Date();
  const w = homeWindows(now);

  const [today, month, risk] = await Promise.all([
    getOwnerToday(w).catch(() => null),
    getOwnerMonth(w).catch(() => null),
    getOwnerRisk(w, now).catch(() => null),
  ]);

  const salesPaise = today?.salesPaise ?? 0;
  const bags = today?.bags ?? 0;
  const marginPaise = month?.margin.paise ?? 0;
  const salesDelta = month ? deltaPct(month.sales.paise, month.prevSales.paise) : null;

  return (
    <div className="flex flex-col gap-4 font-sans">
      {/* Top Today's Sales Hero Card (White rounded card with subtle shadow) */}
      <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-xs">
        <span className="text-xs font-semibold text-muted-foreground">Today&apos;s Sales:</span>
        <div className="mt-1 flex flex-wrap items-baseline gap-2">
          <span className="text-3xl font-black tracking-tight text-foreground">
            {money(salesPaise)}
          </span>
          <span className="text-sm font-semibold text-muted-foreground">
            ({num(bags)} bags)
          </span>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Month Margin:</span>
            <span className="text-base font-extrabold text-foreground">{money(marginPaise)}</span>
          </div>

          {salesDelta !== null && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
              <TrendingUp className="size-3" />
              {salesDelta >= 0 ? `+${salesDelta}%` : `${salesDelta}%`} vs prev
            </span>
          )}
        </div>
      </div>

      {/* Quick Actions (Matching Image 2 style cards in a 2x2 grid) */}
      <div>
        <h2 className="mb-2.5 text-sm font-extrabold text-foreground">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3">
          <QuickActionTile
            href={`/reports/sales?from=${w.today}&to=${w.today}`}
            line1="Reports &"
            line2="Export"
            icon={FileSpreadsheet}
            gradient="bg-gradient-to-br from-orange-500 to-orange-600"
          />

          <QuickActionTile
            href="/suppliers"
            line1="Factory"
            line2="Supplier"
            icon={Building2}
            gradient="bg-gradient-to-br from-amber-500 to-amber-600"
          />

          <QuickActionTile
            href="/retailers"
            line1="Shops &"
            line2="Credit"
            icon={Store}
            gradient="bg-gradient-to-br from-blue-600 to-blue-700"
          />

          <QuickActionTile
            href="/wallet"
            line1="Team &"
            line2="Stock"
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
            Market Dues: <span className="text-foreground">{risk ? short(risk.outstandingPaise) : "₹0"}</span>
          </p>
        </div>

        {risk && risk.overduePct > 0 ? (
          <span className="inline-flex items-center rounded-full bg-rose-500 px-2.5 py-1 text-xs font-bold text-white shadow-xs">
            {risk.overduePct}% Overdue
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
