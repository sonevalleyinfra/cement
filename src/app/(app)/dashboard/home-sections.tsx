import {
  Banknote,
  BadgeCheck,
  CalendarDays,
  ChartColumn,
  ClipboardList,
  Factory,
  History,
  Package,
  Receipt,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { IconTile, type Tone } from "@/components/app/icon-tile";
import { ListCard } from "@/components/app/list-card";
import { Stat } from "@/components/app/stat";
import {
  getAccountsHome,
  getAdminHome,
  getLogisticsHome,
  getMyCash,
  getRetailerHome,
  getSalesHome,
} from "@/lib/home-stats";
import { formatDate, toISTDateKey } from "@/lib/datetime";
import { formatINR } from "@/lib/money";
import { supplierHomeLines } from "@/lib/supplier-rules";

const num = (v: number) => new Intl.NumberFormat("en-IN").format(v);
const money = (p: number) => formatINR(p, { hidePaise: true });

function Cards({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3">{children}</div>;
}

/** The first card on each home section is featured (brand gradient); the rest get a coloured icon. */
function Card({
  href,
  title,
  stats,
  index,
  icon,
  tone,
}: {
  href: string;
  title: string;
  stats: { label: string; value: string }[];
  index: number;
  icon: LucideIcon;
  tone: Tone;
}) {
  const featured = index === 0;
  const Icon = icon;
  return (
    <ListCard
      href={href}
      title={title}
      index={index}
      featured={featured}
      icon={
        featured ? (
          <span aria-hidden className="flex size-10 items-center justify-center rounded-xl bg-white/20 text-white">
            <Icon className="size-5" strokeWidth={2} />
          </span>
        ) : (
          <IconTile icon={icon} tone={tone} />
        )
      }
      bottom={
        stats.length > 0 ? (
          <div className="flex w-full flex-wrap gap-x-8 gap-y-2">
            {stats.map((s) => (
              <Stat key={s.label} label={s.label} value={s.value} />
            ))}
          </div>
        ) : undefined
      }
    />
  );
}

export async function SalesHome({ userId }: { userId: string }) {
  const s = await getSalesHome(userId);
  return (
    <Cards>
      <Card index={0} href="/orders" title="My orders" icon={ClipboardList} tone="orange" stats={[{ label: "Rate to fill", value: num(s.pendingRate) }, { label: "Today", value: num(s.today) }]} />
      <Card
        index={1}
        href="/ledger"
        title="My shops' dues" icon={Banknote} tone="rose"
        stats={[
          { label: "Retailers", value: num(s.retailersWithDues) },
          { label: "Due", value: money(s.duesPaise) },
        ]}
      />
    </Cards>
  );
}

export async function AccountsHome() {
  const s = await getAccountsHome();
  return (
    <Cards>
      <Card index={0} href="/approvals" title="Approvals" icon={BadgeCheck} tone="violet" stats={[{ label: "Waiting", value: num(s.approvals) }]} />
      <Card index={1} href="/receipts/review" title="Online" icon={Receipt} tone="teal" stats={[{ label: "To verify", value: num(s.unverifiedOnline) }]} />
      <Card
        index={2}
        href="/wallet"
        title="Cash handovers" icon={Wallet} tone="green"
        stats={[
          { label: "To confirm", value: num(s.handoversToConfirm) },
          { label: "Amount", value: money(s.cashToConfirmPaise) },
        ]}
      />
    </Cards>
  );
}

export async function LogisticsHome() {
  const s = await getLogisticsHome();
  return (
    <Cards>
      <Card index={0} href="/dispatch" title="Dispatch" icon={Truck} tone="blue" stats={[{ label: "Ready", value: num(s.ready) }, { label: "Partly sent", value: num(s.partly) }]} />
      {s.stock.length === 0 ? (
        <EmptyState title="No stock" />
      ) : (
        <Card
          index={1}
          href="/stock"
          title="Stock" icon={Package} tone="blue"
          stats={s.stock.map((p) => ({ label: p.name, value: `${num(p.bags)} bags` }))}
        />
      )}
    </Cards>
  );
}

export async function AdminHome() {
  const s = await getAdminHome();
  const today = toISTDateKey(new Date());
  return (
    <Cards>
      <Card
        index={0}
        href={`/reports/sales?from=${today}&to=${today}`}
        title="Today"
        icon={CalendarDays}
        tone="orange"
        stats={[
          { label: "Sales", value: money(s.salesTodayPaise) },
          { label: "Bags sent", value: num(s.bagsDispatched) },
          { label: "Orders", value: num(s.todayOrders) },
        ]}
      />
      <Card index={1} href="/ledger" title="Dues" icon={Banknote} tone="rose" stats={[{ label: "Outstanding", value: money(s.duesPaise) }]} />
      <Card index={2} href="/stock" title="Stock" icon={Package} tone="blue" stats={[{ label: "Bags", value: num(s.stockBags) }]} />
      <Card index={3} href="/wallet" title="Cash" icon={Wallet} tone="green" stats={[{ label: "Held by staff", value: money(s.cashInHandPaise) }]} />
      <Card index={4} href="/receipts/review" title="Online" icon={Receipt} tone="teal" stats={[{ label: "To verify", value: num(s.unverifiedOnline) }]} />
      <Card index={5} href="/approvals" title="Approvals" icon={BadgeCheck} tone="violet" stats={[{ label: "Waiting", value: num(s.approvals) }]} />
      <Card index={6} href="/dispatch" title="Dispatch" icon={Truck} tone="blue" stats={[{ label: "To send", value: num(s.toDispatch) }]} />
      <Card
        index={7}
        href="/suppliers"
        title="Suppliers" icon={Factory} tone="amber"
        stats={supplierHomeLines(s.suppliers).map((l) => ({ label: l.text, value: money(l.amountPaise) }))}
      />
      <Card index={8} href="/reports" title="Reports" icon={ChartColumn} tone="orange" stats={[]} />
      <Card index={9} href="/activity" title="Activity" icon={History} tone="slate" stats={[]} />
    </Cards>
  );
}

export async function RetailerHome({ userId }: { userId: string }) {
  const s = await getRetailerHome(userId);
  if (!s) return <EmptyState title="No shop linked" />;
  return (
    <Cards>
      <Card index={0} href="/orders" title="My orders" icon={ClipboardList} tone="orange" stats={[{ label: "Open", value: num(s.openOrders) }]} />
      <Card
        index={1}
        href="/ledger"
        title="My dues" icon={Banknote} tone="rose"
        stats={[{ label: s.balancePaise < 0 ? "Advance" : "Due", value: money(Math.abs(s.balancePaise)) }]}
      />
      <Card
        index={2}
        href="/receipts"
        title="My payments" icon={Receipt} tone="teal"
        stats={
          s.lastPayment
            ? [
                { label: "Last", value: money(s.lastPayment.totalPaise) },
                { label: "On", value: formatDate(s.lastPayment.createdAt) },
              ]
            : [{ label: "Last", value: "None" }]
        }
      />
    </Cards>
  );
}

/** "My cash held": shown once on every staff member's home. */
export async function MyCashHome({ userId }: { userId: string }) {
  const s = await getMyCash(userId);
  const stats = [{ label: "Held", value: money(s.heldPaise) }];
  if (s.pendingPaise > 0) stats.push({ label: "Waiting", value: money(s.pendingPaise) });
  return (
    <Cards>
      <Card index={1} href="/wallet" title="My cash" icon={Wallet} tone="green" stats={stats} />
    </Cards>
  );
}
