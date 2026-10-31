import {
  ArrowRight,
  BadgeAlert,
  BadgeCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
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
import { Suspense, type ReactNode } from "react";
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
import { homeWindows } from "@/lib/owner-home-rules";
import { getSuppliers } from "@/lib/suppliers";
import { cn } from "@/lib/utils";
import { bagsText, formatCount } from "@/lib/words";
import { OverdueRow } from "@/components/app/overdue-row";

const num = (v: number) => new Intl.NumberFormat("en-IN").format(v);
const money = (p: number) => formatINR(p, { hidePaise: true });
const short = (p: number) => (Math.abs(p) >= 1_00_000_00 ? formatINRCompact(p) : money(p));

/* ----------------- Reusable Simple Action Components ----------------- */

interface ActionCardProps {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  badge?: string | number | null;
  badgeTone?: "emerald" | "amber" | "blue" | "rose" | "purple" | "neutral";
  colorClass?: string;
  bgClass?: string;
  iconBgClass?: string;
}

const BADGE_STYLES = {
  emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  blue: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  rose: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
  purple: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30",
  neutral: "bg-muted text-muted-foreground border-border",
};

export function SimpleActionCard({
  href,
  title,
  description,
  icon: Icon,
  badge,
  badgeTone = "neutral",
  colorClass = "text-foreground",
  bgClass = "bg-card hover:bg-muted/40",
  iconBgClass = "bg-primary/10 text-primary",
}: ActionCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex min-h-[76px] items-center gap-3.5 rounded-2xl border border-border/80 p-4 shadow-xs transition-all active:scale-[0.985]",
        bgClass,
      )}
    >
      <div className={cn("flex size-12 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105", iconBgClass)}>
        <Icon className="size-6" strokeWidth={2.2} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="flex items-center gap-2">
          <span className={cn("truncate text-base font-bold tracking-tight", colorClass)}>{title}</span>
          {badge !== undefined && badge !== null && (
            <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums", BADGE_STYLES[badgeTone])}>
              {badge}
            </span>
          )}
        </div>
        <p className="line-clamp-1 text-xs text-muted-foreground">{description}</p>
      </div>

      <ChevronRight className="size-5 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
    </Link>
  );
}

/* ----------------- 1. Admin / Owner Simple Home ----------------- */

export async function SimpleAdminHome() {
  const now = new Date();
  const w = homeWindows(now);

  const [today, month, risk, adminStats] = await Promise.all([
    getOwnerToday(w).catch(() => null),
    getOwnerMonth(w).catch(() => null),
    getOwnerRisk(w, now).catch(() => null),
    getAdminHome().catch(() => null),
  ]);

  return (
    <div className="flex flex-col gap-4">
      {/* Hero Business Status Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-950 p-4 text-white shadow-md dark:border dark:border-neutral-800">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="text-xs font-medium uppercase tracking-wider text-neutral-400">Today&apos;s Sales</span>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold tracking-tight">
                {today ? money(today.salesPaise) : "₹—"}
              </span>
              {today && (
                <span className="text-xs font-semibold text-emerald-400">
                  {bagsText(today.bags)}
                </span>
              )}
            </div>
          </div>
          {month && (
            <div className="text-right">
              <span className="text-xs font-medium uppercase tracking-wider text-neutral-400">Month Margin</span>
              <p className="mt-0.5 text-sm font-bold text-emerald-400">
                {money(month.margin.paise)}
              </p>
            </div>
          )}
        </div>

        {today && (
          <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5 text-xs text-neutral-300">
            <span>
              Collected Today: <strong className="text-white">{money(today.collected.totalPaise)}</strong>
            </span>
            <span className="text-[11px] text-neutral-400">
              Cash {money(today.collected.cashPaise)} · Online {money(today.collected.onlinePaise)}
            </span>
          </div>
        )}
      </div>

      {/* 4 Primary Big Action Cards */}
      <div className="flex flex-col gap-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Quick Management Actions
        </span>

        <SimpleActionCard
          href={`/reports/sales?from=${w.today}&to=${w.today}`}
          title="Reports & Excel Export"
          description="Detailed sales register, vehicle dispatches & CSV"
          icon={FileSpreadsheet}
          iconBgClass="bg-amber-500/15 text-amber-600 dark:text-amber-400"
          badge="Live Register"
          badgeTone="amber"
        />

        <SimpleActionCard
          href="/suppliers"
          title="Factory & Suppliers"
          description="Prism Cement, plant purchases & factory balance"
          icon={Building2}
          iconBgClass="bg-teal-500/15 text-teal-600 dark:text-teal-400"
        />

        <SimpleActionCard
          href="/retailers"
          title="Shops & Credit Dues"
          description="Retailer balances, credit limits & statements"
          icon={Store}
          iconBgClass="bg-blue-500/15 text-blue-600 dark:text-blue-400"
          badge={risk ? `${risk.overduePct}% Overdue` : undefined}
          badgeTone={risk && risk.overduePct > 20 ? "rose" : "neutral"}
        />

        <SimpleActionCard
          href="/wallet"
          title="Team Cash & Operations"
          description="Staff cash-in-hand, approvals & stock"
          icon={Wallet}
          iconBgClass="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          badge={adminStats && adminStats.approvals > 0 ? `${adminStats.approvals} Waiting` : undefined}
          badgeTone="emerald"
        />
      </div>

      {/* Market Risk Alert Strip */}
      {risk && risk.outstandingPaise > 0 && (
        <Link
          href="/ledger?show=overdue"
          className="flex items-center justify-between rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-semibold text-rose-700 dark:text-rose-400 transition-colors hover:bg-rose-500/15"
        >
          <div className="flex items-center gap-2">
            <BadgeAlert className="size-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>Market Outstanding: <strong>{money(risk.outstandingPaise)}</strong></span>
          </div>
          <span className="flex items-center gap-0.5 underline">
            View Overdue <ChevronRight className="size-3.5" />
          </span>
        </Link>
      )}
    </div>
  );
}

/* ----------------- 2. Sales Simple Home ----------------- */

export async function SimpleSalesHome({ userId }: { userId: string }) {
  const [s, cash] = await Promise.all([
    getSalesHome(userId),
    getMyCash(userId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      {/* Hero Status Banner: Cash in Hand with 1-tap Handover */}
      <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 p-4 text-white shadow-md">
        <div>
          <span className="text-xs font-medium uppercase tracking-wider text-white/80">Cash in Hand</span>
          <p className="text-2xl font-extrabold tracking-tight">{money(cash.heldPaise)}</p>
          <p className="mt-0.5 text-xs text-white/80">
            Collected today: <strong>{money(s.collectedTodayPaise)}</strong>
          </p>
        </div>

        <Link
          href="/wallet"
          className="inline-flex items-center gap-1 rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-emerald-800 shadow-sm transition-transform active:scale-95 hover:bg-white/95"
        >
          <HandCoins className="size-4" />
          <span>Handover</span>
        </Link>
      </div>

      {/* 3 Primary Big Action Cards */}
      <div className="flex flex-col gap-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Sales Actions
        </span>

        <SimpleActionCard
          href="/orders/new"
          title="New Order"
          description="Select shop and book cement bags"
          icon={ShoppingCart}
          iconBgClass="bg-amber-500/15 text-amber-600 dark:text-amber-400"
          badge="Book Cement"
          badgeTone="amber"
        />

        <SimpleActionCard
          href="/receipts/new"
          title="Collect Payment"
          description="Record cash or UPI payment from shop"
          icon={Coins}
          iconBgClass="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          badge="Record"
          badgeTone="emerald"
        />

        <SimpleActionCard
          href="/ledger"
          title="Shop Dues & Khata"
          description={`${s.retailersWithDues} shops have dues · Total ${money(s.duesPaise)}`}
          icon={Store}
          iconBgClass="bg-blue-500/15 text-blue-600 dark:text-blue-400"
        />
      </div>

      {/* Collect Today Quick List (Overdue preview) */}
      {s.collect && s.collect.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Collect Today ({s.collect.length})
            </span>
            <Link href="/ledger?show=overdue" className="text-xs font-semibold text-primary hover:underline">
              View All
            </Link>
          </div>
          <ul className="flex flex-col gap-2">
            {s.collect.slice(0, 3).map((r) => (
              <li key={r.retailerId}>
                <OverdueRow row={r} href={`/receipts/new?retailer=${r.retailerId}`} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ----------------- 3. Accounts Simple Home ----------------- */

export async function SimpleAccountsHome() {
  const s = await getAccountsHome();

  return (
    <div className="flex flex-col gap-4">
      {/* Hero Verification Strip */}
      <div className="rounded-2xl bg-gradient-to-r from-sky-700 via-indigo-800 to-blue-900 p-4 text-white shadow-md">
        <span className="text-xs font-medium uppercase tracking-wider text-white/80">Accounts Verification</span>
        <div className="mt-1 flex items-baseline justify-between">
          <p className="text-xl font-extrabold tracking-tight">
            {s.approvals + s.unverifiedOnline + s.handoversToConfirm} Actions Pending
          </p>
          <span className="text-xs font-semibold text-sky-200">
            Cash to verify: {money(s.cashToConfirmPaise)}
          </span>
        </div>
      </div>

      {/* 3 Primary Big Action Cards */}
      <div className="flex flex-col gap-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Pending Approvals
        </span>

        <SimpleActionCard
          href="/approvals"
          title="Approve Orders"
          description="Orders awaiting credit limit or rate clearance"
          icon={BadgeCheck}
          iconBgClass="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          badge={s.approvals > 0 ? `${s.approvals} Pending` : "None"}
          badgeTone={s.approvals > 0 ? "amber" : "neutral"}
        />

        <SimpleActionCard
          href="/receipts/review"
          title="Verify Online / UPI"
          description="Verify online payments against bank statement"
          icon={Receipt}
          iconBgClass="bg-blue-500/15 text-blue-600 dark:text-blue-400"
          badge={s.unverifiedOnline > 0 ? `${s.unverifiedOnline} To Verify` : "Clear"}
          badgeTone={s.unverifiedOnline > 0 ? "blue" : "neutral"}
        />

        <SimpleActionCard
          href="/wallet"
          title="Cash Handovers"
          description="Confirm cash submitted by sales team"
          icon={Wallet}
          iconBgClass="bg-purple-500/15 text-purple-600 dark:text-purple-400"
          badge={s.handoversToConfirm > 0 ? `${s.handoversToConfirm} Requests` : "All Confirmed"}
          badgeTone={s.handoversToConfirm > 0 ? "purple" : "neutral"}
        />
      </div>
    </div>
  );
}

/* ----------------- 4. Logistics Simple Home ----------------- */

export async function SimpleLogisticsHome() {
  const now = new Date();
  const s = await getLogisticsHome(now);

  return (
    <div className="flex flex-col gap-4">
      {/* Fleet & Godown Status Hero */}
      <div className="rounded-2xl bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 p-4 text-white shadow-md">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-medium uppercase tracking-wider text-white/80">Godown Stock</span>
            <p className="text-2xl font-extrabold tracking-tight">{num(s.godown.bags)} Bags</p>
          </div>
          <div className="text-right">
            <span className="text-xs font-medium uppercase tracking-wider text-white/80">Fleet</span>
            <p className="text-base font-bold text-white">
              {s.trucks.length} Loaded Trucks
            </p>
          </div>
        </div>
      </div>

      {/* 3 Primary Big Action Cards */}
      <div className="flex flex-col gap-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Logistics Operations
        </span>

        <SimpleActionCard
          href="/dispatch"
          title="Dispatch Truck"
          description="Assign vehicle, driver & send loaded cement"
          icon={Truck}
          iconBgClass="bg-orange-500/15 text-orange-600 dark:text-orange-400"
          badge={s.ready > 0 ? `${s.ready} Ready` : "No Orders"}
          badgeTone={s.ready > 0 ? "amber" : "neutral"}
        />

        <SimpleActionCard
          href="/stock/purchase"
          title="Factory Purchase"
          description="Receive fresh cement bags from factory/plant"
          icon={PackagePlus}
          iconBgClass="bg-teal-500/15 text-teal-600 dark:text-teal-400"
          badge="Receive"
          badgeTone="neutral"
        />

        <SimpleActionCard
          href="/stock"
          title="Godown Stock & Transfers"
          description="Check inventory balances & inter-godown transfers"
          icon={Warehouse}
          iconBgClass="bg-blue-500/15 text-blue-600 dark:text-blue-400"
        />
      </div>

      {/* Loaded Trucks Preview */}
      {s.trucks.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Currently Loaded Trucks
          </span>
          <div className="flex flex-col gap-2">
            {s.trucks.map((t) => (
              <Link
                key={t.truck}
                href="/stock"
                className="flex items-center justify-between rounded-xl border border-border/80 bg-card p-3 text-xs shadow-xs hover:bg-muted/30"
              >
                <div className="flex items-center gap-2">
                  <Truck className="size-4 text-primary" />
                  <span className="font-bold">{t.truck}</span>
                </div>
                <div className="flex items-center gap-1.5 font-semibold text-muted-foreground">
                  {t.products.map((p) => `${p.name}: ${p.bags} bags`).join(" · ")}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------- 5. Retailer Simple Home ----------------- */

export async function SimpleRetailerHome({ userId }: { userId: string }) {
  const s = await getRetailerHome(userId);
  if (!s) return <EmptyState title="No shop linked" />;

  const isDue = s.balancePaise > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Hero Balance Strip */}
      <div
        className={cn(
          "flex items-center justify-between rounded-2xl p-4 text-white shadow-md",
          isDue
            ? "bg-gradient-to-r from-rose-600 via-rose-700 to-amber-700"
            : "bg-gradient-to-r from-emerald-600 to-teal-700",
        )}
      >
        <div>
          <span className="text-xs font-medium uppercase tracking-wider text-white/80">
            {isDue ? "Outstanding Dues" : "Advance Balance"}
          </span>
          <p className="text-2xl font-extrabold tracking-tight">{money(Math.abs(s.balancePaise))}</p>
        </div>

        <Link
          href="/receipts/new"
          className="inline-flex items-center gap-1 rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-neutral-900 shadow-sm transition-transform active:scale-95 hover:bg-white/95"
        >
          <Coins className="size-4 text-emerald-600" />
          <span>Pay Online</span>
        </Link>
      </div>

      {/* 3 Primary Big Action Cards */}
      <div className="flex flex-col gap-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          My Shop Actions
        </span>

        <SimpleActionCard
          href="/orders/new"
          title="Order Cement"
          description="Book fresh PPC or OPC cement delivery"
          icon={ShoppingCart}
          iconBgClass="bg-amber-500/15 text-amber-600 dark:text-amber-400"
          badge="Book"
          badgeTone="amber"
        />

        <SimpleActionCard
          href="/orders?show=open"
          title="Track Delivery"
          description="Check order status & dispatched trucks"
          icon={Truck}
          iconBgClass="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          badge={s.openOrders > 0 ? `${s.openOrders} Active` : "None"}
          badgeTone={s.openOrders > 0 ? "emerald" : "neutral"}
        />

        <SimpleActionCard
          href="/ledger"
          title="My Khata / Ledger"
          description="Complete statement of bills & payments"
          icon={Store}
          iconBgClass="bg-blue-500/15 text-blue-600 dark:text-blue-400"
        />
      </div>
    </div>
  );
}
