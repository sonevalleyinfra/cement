import {
  ArrowRight,
  BadgeAlert,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Coins,
  FileSpreadsheet,
  HandCoins,
  Package,
  PackagePlus,
  Receipt,
  RotateCcw,
  ShoppingCart,
  Store,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  Warehouse,
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
import { OverdueRow } from "@/components/app/overdue-row";

const num = (v: number) => new Intl.NumberFormat("en-IN").format(v);
const money = (p: number) => formatINR(p, { hidePaise: true });
const short = (p: number) => (Math.abs(p) >= 1_00_000_00 ? formatINRCompact(p) : money(p));

/* =========================================================================
   1. ADMIN / OWNER SCREEN (Exact Match to admin_owner_dashboard_mockup)
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

      {/* 4 Prominent High-Contrast Action Cards (2x2 Grid) */}
      <div className="grid grid-cols-2 gap-3">
        {/* 1. Reports & Export (Orange Card) */}
        <Link
          href={`/reports/sales?from=${w.today}&to=${w.today}`}
          className="group flex min-h-[140px] flex-col justify-between rounded-3xl bg-gradient-to-br from-orange-500 to-orange-600 p-4 text-white shadow-sm transition-all duration-200 active:scale-[0.98] hover:shadow-md hover:brightness-105"
        >
          <div className="flex size-11 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-xs transition-transform group-hover:scale-105">
            <FileSpreadsheet className="size-6 text-white" strokeWidth={2.2} />
          </div>
          <div>
            <h3 className="text-base font-extrabold leading-snug">Reports &amp; Export</h3>
            <p className="mt-1 text-xs font-medium text-white/85 leading-tight">
              Sales register &amp; Excel CSV
            </p>
          </div>
        </Link>

        {/* 2. Factory Supplier (Amber Card) */}
        <Link
          href="/suppliers"
          className="group flex min-h-[140px] flex-col justify-between rounded-3xl bg-gradient-to-br from-amber-500 to-amber-600 p-4 text-white shadow-sm transition-all duration-200 active:scale-[0.98] hover:shadow-md hover:brightness-105"
        >
          <div className="flex size-11 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-xs transition-transform group-hover:scale-105">
            <Building2 className="size-6 text-white" strokeWidth={2.2} />
          </div>
          <div>
            <h3 className="text-base font-extrabold leading-snug">Factory Supplier</h3>
            <p className="mt-1 text-xs font-medium text-white/85 leading-tight">
              Prism Cement account &amp; balance
            </p>
          </div>
        </Link>

        {/* 3. Shops & Credit (Vibrant Blue Card) */}
        <Link
          href="/retailers"
          className="group flex min-h-[140px] flex-col justify-between rounded-3xl bg-gradient-to-br from-blue-600 to-blue-700 p-4 text-white shadow-sm transition-all duration-200 active:scale-[0.98] hover:shadow-md hover:brightness-105"
        >
          <div className="flex size-11 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-xs transition-transform group-hover:scale-105">
            <Store className="size-6 text-white" strokeWidth={2.2} />
          </div>
          <div>
            <h3 className="text-base font-extrabold leading-snug">Shops &amp; Credit</h3>
            <p className="mt-1 text-xs font-medium text-white/85 leading-tight">
              Retailer dues &amp; credit limits
            </p>
          </div>
        </Link>

        {/* 4. Team & Stock (Emerald Green Card) */}
        <Link
          href="/wallet"
          className="group flex min-h-[140px] flex-col justify-between rounded-3xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-4 text-white shadow-sm transition-all duration-200 active:scale-[0.98] hover:shadow-md hover:brightness-105"
        >
          <div className="flex size-11 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-xs transition-transform group-hover:scale-105">
            <Users className="size-6 text-white" strokeWidth={2.2} />
          </div>
          <div>
            <h3 className="text-base font-extrabold leading-snug">Team &amp; Stock</h3>
            <p className="mt-1 text-xs font-medium text-white/85 leading-tight">
              Staff cash &amp; godown inventory
            </p>
          </div>
        </Link>
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

/* =========================================================================
   2. SALES SCREEN (Exact Match to buildcity_mobile_app_mockup)
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

      {/* Quick Actions (3 Vibrant Vertical Cards) */}
      <div>
        <h2 className="mb-2.5 text-sm font-extrabold text-foreground">Quick Actions</h2>
        <div className="grid grid-cols-3 gap-2.5">
          {/* New Order (Orange Card) */}
          <Link
            href="/orders/new"
            className="group flex min-h-[135px] flex-col justify-between rounded-3xl bg-gradient-to-b from-orange-500 to-orange-600 p-3.5 text-white shadow-sm transition-all duration-200 active:scale-[0.98] hover:shadow-md hover:brightness-105"
          >
            <div className="flex size-10 items-center justify-center rounded-xl bg-white/20 transition-transform group-hover:scale-105">
              <ShoppingCart className="size-5 text-white" strokeWidth={2.4} />
            </div>
            <div>
              <span className="text-sm font-black leading-tight block">New<br />Order</span>
            </div>
          </Link>

          {/* Collect Payment (Emerald Green Card) */}
          <Link
            href="/receipts/new"
            className="group flex min-h-[135px] flex-col justify-between rounded-3xl bg-gradient-to-b from-emerald-500 to-emerald-600 p-3.5 text-white shadow-sm transition-all duration-200 active:scale-[0.98] hover:shadow-md hover:brightness-105"
          >
            <div className="flex size-10 items-center justify-center rounded-xl bg-white/20 transition-transform group-hover:scale-105">
              <span className="text-lg font-black leading-none">₹</span>
            </div>
            <div>
              <span className="text-sm font-black leading-tight block">Collect<br />Payment</span>
            </div>
          </Link>

          {/* Shop Dues (Blue Card) */}
          <Link
            href="/ledger"
            className="group flex min-h-[135px] flex-col justify-between rounded-3xl bg-gradient-to-b from-blue-600 to-blue-700 p-3.5 text-white shadow-sm transition-all duration-200 active:scale-[0.98] hover:shadow-md hover:brightness-105"
          >
            <div className="flex size-10 items-center justify-center rounded-xl bg-white/20 transition-transform group-hover:scale-105">
              <Store className="size-5 text-white" strokeWidth={2.4} />
            </div>
            <div>
              <span className="text-sm font-black leading-tight block">Shop<br />Dues</span>
            </div>
          </Link>
        </div>
      </div>

      {/* Recent Activity / Overdue Collection Feed */}
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
   3. ACCOUNTS SCREEN (Exact Match to buildcity_role_ui_mockup Screen 1)
   ========================================================================= */

export async function SimpleAccountsHome() {
  const s = await getAccountsHome();

  return (
    <div className="flex flex-col gap-3.5 font-sans">
      {/* 1. Approve Orders (Emerald Green Card) */}
      <Link
        href="/approvals"
        className="group relative flex min-h-[88px] items-center justify-between rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-700 px-5 py-4 text-white shadow-sm transition-all duration-200 active:scale-[0.98] hover:shadow-md hover:brightness-105"
      >
        <div>
          <h3 className="text-lg font-black tracking-tight">Approve Orders</h3>
          <span className="mt-1 inline-flex items-center rounded-full bg-emerald-950/40 px-2.5 py-0.5 text-xs font-bold text-emerald-200">
            {s.approvals} Pending
          </span>
        </div>
        <ChevronRight className="size-6 text-white/70 transition-transform group-hover:translate-x-1 group-hover:text-white" />
      </Link>

      {/* 2. Verify Online / UPI (Blue Card) */}
      <Link
        href="/receipts/review"
        className="group relative flex min-h-[88px] items-center justify-between rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-4 text-white shadow-sm transition-all duration-200 active:scale-[0.98] hover:shadow-md hover:brightness-105"
      >
        <div>
          <h3 className="text-lg font-black tracking-tight">Verify Online / UPI</h3>
          <span className="mt-1 inline-flex items-center rounded-full bg-blue-950/40 px-2.5 py-0.5 text-xs font-bold text-blue-200">
            {s.unverifiedOnline > 0 ? `${s.unverifiedOnline} Waiting` : "All Verified"}
          </span>
        </div>
        <ChevronRight className="size-6 text-white/70 transition-transform group-hover:translate-x-1 group-hover:text-white" />
      </Link>

      {/* 3. Cash Handovers (Purple Card) */}
      <Link
        href="/wallet"
        className="group relative flex min-h-[88px] items-center justify-between rounded-2xl bg-gradient-to-r from-purple-600 to-purple-700 px-5 py-4 text-white shadow-sm transition-all duration-200 active:scale-[0.98] hover:shadow-md hover:brightness-105"
      >
        <div>
          <h3 className="text-lg font-black tracking-tight">Cash Handovers</h3>
          <span className="mt-1 inline-flex items-center rounded-full bg-purple-950/40 px-2.5 py-0.5 text-xs font-bold text-purple-200">
            {s.handoversToConfirm} Requests ({money(s.cashToConfirmPaise)})
          </span>
        </div>
        <ChevronRight className="size-6 text-white/70 transition-transform group-hover:translate-x-1 group-hover:text-white" />
      </Link>

      {/* Pending Approvals Header & Quick Summary */}
      <div className="mt-2 flex flex-col gap-2">
        <h2 className="text-sm font-extrabold text-foreground">Pending Approvals</h2>

        <div className="flex flex-col gap-2">
          <Link
            href="/approvals"
            className="flex items-center justify-between rounded-2xl border border-border/80 bg-card p-4 shadow-xs transition-colors hover:bg-muted/40"
          >
            <div>
              <p className="text-sm font-bold text-foreground">Orders Waiting Approval</p>
              <p className="text-xs text-muted-foreground">Credit limit &amp; rate checks</p>
            </div>
            <div className="text-right">
              <span className="text-base font-extrabold text-primary">{s.approvals}</span>
              <span className="block text-[11px] text-muted-foreground">Orders</span>
            </div>
          </Link>

          <Link
            href="/wallet"
            className="flex items-center justify-between rounded-2xl border border-border/80 bg-card p-4 shadow-xs transition-colors hover:bg-muted/40"
          >
            <div>
              <p className="text-sm font-bold text-foreground">Sales Staff Cash Waiting</p>
              <p className="text-xs text-muted-foreground">Requires accounts receipt confirmation</p>
            </div>
            <div className="text-right">
              <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                {money(s.cashToConfirmPaise)}
              </span>
              <span className="block text-[11px] text-muted-foreground">{s.handoversToConfirm} staff</span>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   4. LOGISTICS SCREEN (Exact Match to buildcity_role_ui_mockup Screen 2)
   ========================================================================= */

export async function SimpleLogisticsHome() {
  const now = new Date();
  const s = await getLogisticsHome(now);

  return (
    <div className="flex flex-col gap-3.5 font-sans">
      {/* Top Status Pill: 3 Trucks Loaded · 4 Standing */}
      <div className="flex items-center justify-center rounded-2xl border border-border/70 bg-card py-2.5 px-4 shadow-xs">
        <span className="text-xs font-bold text-muted-foreground">
          {s.trucks.length} Trucks Loaded · {num(s.godown.bags)} Bags in Godown
        </span>
      </div>

      {/* 1. Dispatch Truck (Bold Orange Card) */}
      <Link
        href="/dispatch"
        className="group relative flex min-h-[92px] items-center justify-between rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 px-5 py-4 text-white shadow-sm transition-all duration-200 active:scale-[0.98] hover:shadow-md hover:brightness-105"
      >
        <div className="flex items-center gap-3.5">
          <div className="flex size-11 items-center justify-center rounded-xl bg-white/20">
            <Truck className="size-6 text-white" strokeWidth={2.4} />
          </div>
          <div>
            <h3 className="text-lg font-black tracking-tight">Dispatch Truck</h3>
            <span className="text-xs font-semibold text-white/90">
              {s.ready} Ready to Send
            </span>
          </div>
        </div>
        <ChevronRight className="size-6 text-white/70 transition-transform group-hover:translate-x-1 group-hover:text-white" />
      </Link>

      {/* 2. Factory Purchase (Teal Card) */}
      <Link
        href="/stock/purchase"
        className="group relative flex min-h-[92px] items-center justify-between rounded-2xl bg-gradient-to-r from-teal-600 to-teal-700 px-5 py-4 text-white shadow-sm transition-all duration-200 active:scale-[0.98] hover:shadow-md hover:brightness-105"
      >
        <div className="flex items-center gap-3.5">
          <div className="flex size-11 items-center justify-center rounded-xl bg-white/20">
            <Warehouse className="size-6 text-white" strokeWidth={2.4} />
          </div>
          <div>
            <h3 className="text-lg font-black tracking-tight">Factory Purchase</h3>
            <span className="text-xs font-semibold text-white/90">Receive Cement</span>
          </div>
        </div>
        <ChevronRight className="size-6 text-white/70 transition-transform group-hover:translate-x-1 group-hover:text-white" />
      </Link>

      {/* 3. Move Bags (Slate / Dark Navy Card) */}
      <Link
        href="/stock"
        className="group relative flex min-h-[92px] items-center justify-between rounded-2xl bg-gradient-to-r from-slate-700 to-slate-800 px-5 py-4 text-white shadow-sm transition-all duration-200 active:scale-[0.98] hover:shadow-md hover:brightness-105"
      >
        <div className="flex items-center gap-3.5">
          <div className="flex size-11 items-center justify-center rounded-xl bg-white/20">
            <Package className="size-6 text-white" strokeWidth={2.4} />
          </div>
          <div>
            <h3 className="text-lg font-black tracking-tight">Move Bags</h3>
            <span className="text-xs font-semibold text-white/90">For internal warehouse transfers</span>
          </div>
        </div>
        <ChevronRight className="size-6 text-white/70 transition-transform group-hover:translate-x-1 group-hover:text-white" />
      </Link>

      {/* Ready for Dispatch Preview */}
      <div className="mt-2 flex flex-col gap-2">
        <h2 className="text-sm font-extrabold text-foreground">Ready for Dispatch</h2>

        {s.trucks.length > 0 ? (
          <div className="flex flex-col gap-2">
            {s.trucks.slice(0, 2).map((t) => (
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
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                    {t.products.reduce((acc, p) => acc + p.bags, 0)} bags
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex min-h-16 items-center justify-center rounded-2xl border border-dashed border-border/80 bg-muted/20 text-xs font-medium text-muted-foreground">
            No loaded trucks waiting
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   5. RETAILER SCREEN (Exact Match to buildcity_role_ui_mockup Screen 3)
   ========================================================================= */

export async function SimpleRetailerHome({ userId }: { userId: string }) {
  const s = await getRetailerHome(userId);
  if (!s) return <EmptyState title="No shop linked" />;

  const isDue = s.balancePaise > 0;

  return (
    <div className="flex flex-col gap-3.5 font-sans">
      {/* Top Outstanding Dues Hero Card */}
      <div className="flex items-center justify-between rounded-3xl border border-border/70 bg-card p-5 shadow-xs">
        <div>
          <span className="text-xs font-semibold text-muted-foreground">
            {isDue ? "Outstanding Dues:" : "Advance Balance:"}
          </span>
          <p className={cn("mt-0.5 text-3xl font-black tracking-tight", isDue ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>
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

      {/* 1. Order Cement (Coral / Vibrant Red-Orange Card) */}
      <Link
        href="/orders/new"
        className="group relative flex min-h-[96px] items-center justify-between rounded-3xl bg-gradient-to-r from-orange-500 via-rose-500 to-rose-600 px-5 py-4 text-white shadow-sm transition-all duration-200 active:scale-[0.98] hover:shadow-md hover:brightness-105"
      >
        <div className="flex items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-white/20">
            <ShoppingCart className="size-6 text-white" strokeWidth={2.4} />
          </div>
          <div>
            <h3 className="text-xl font-black tracking-tight">Order Cement</h3>
            <span className="text-xs font-semibold text-white/90">Book PPC / OPC Cement Bags</span>
          </div>
        </div>
        <ChevronRight className="size-6 text-white/70 transition-transform group-hover:translate-x-1 group-hover:text-white" />
      </Link>

      {/* 2. Track Delivery (Emerald Green Card) */}
      <Link
        href="/orders?show=open"
        className="group relative flex min-h-[96px] items-center justify-between rounded-3xl bg-gradient-to-r from-emerald-600 to-emerald-700 px-5 py-4 text-white shadow-sm transition-all duration-200 active:scale-[0.98] hover:shadow-md hover:brightness-105"
      >
        <div className="flex items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-white/20">
            <Truck className="size-6 text-white" strokeWidth={2.4} />
          </div>
          <div>
            <h3 className="text-xl font-black tracking-tight">Track Delivery</h3>
            <span className="text-xs font-semibold text-white/90">
              {s.openOrders > 0 ? `${s.openOrders} Truck Dispatched / Active` : "No active deliveries"}
            </span>
          </div>
        </div>
        <ChevronRight className="size-6 text-white/70 transition-transform group-hover:translate-x-1 group-hover:text-white" />
      </Link>

      {/* 3. My Khata / Ledger (Vibrant Blue Card) */}
      <Link
        href="/ledger"
        className="group relative flex min-h-[96px] items-center justify-between rounded-3xl bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-4 text-white shadow-sm transition-all duration-200 active:scale-[0.98] hover:shadow-md hover:brightness-105"
      >
        <div className="flex items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-white/20">
            <Store className="size-6 text-white" strokeWidth={2.4} />
          </div>
          <div>
            <h3 className="text-xl font-black tracking-tight">My Khata / Ledger</h3>
            <span className="text-xs font-semibold text-white/90">Access ledger and financial statements</span>
          </div>
        </div>
        <ChevronRight className="size-6 text-white/70 transition-transform group-hover:translate-x-1 group-hover:text-white" />
      </Link>
    </div>
  );
}
