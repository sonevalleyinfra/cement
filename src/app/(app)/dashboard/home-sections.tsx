import {
  Banknote,
  BadgeCheck,
  CalendarDays,
  ClipboardList,
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
  getRetailerHome,
  getSalesHome,
} from "@/lib/home-stats";
import { formatINR } from "@/lib/money";

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
        <div className="flex w-full flex-wrap gap-x-8 gap-y-2">
          {stats.map((s) => (
            <Stat key={s.label} label={s.label} value={s.value} />
          ))}
        </div>
      }
    />
  );
}

export async function SalesHome({ userId, firmIds }: { userId: string; firmIds: string[] }) {
  if (firmIds.length === 0) return <EmptyState title="No firm" />;
  const s = await getSalesHome(userId, firmIds);
  return (
    <Cards>
      <Card index={0} href="/orders" title="My orders" icon={ClipboardList} tone="orange" stats={[{ label: "Rate pending", value: num(s.pendingRate) }, { label: "Today", value: num(s.today) }]} />
      <Card index={1} href="/ledger" title="Dues" icon={Banknote} tone="rose" stats={[{ label: "Retailers", value: num(s.retailersWithDues) }]} />
    </Cards>
  );
}

export async function AccountsHome({ firmIds }: { firmIds: string[] }) {
  if (firmIds.length === 0) return <EmptyState title="No firm" />;
  const s = await getAccountsHome(firmIds);
  return (
    <Cards>
      <Card index={0} href="/approvals" title="Approvals" icon={BadgeCheck} tone="violet" stats={[{ label: "Waiting", value: num(s.approvals) }]} />
      <Card
        index={1}
        href="/receipts/review"
        title="Receipts" icon={Receipt} tone="teal"
        stats={[
          { label: "Online to verify", value: num(s.unverifiedOnline) },
          { label: "Cheques pending", value: num(s.pendingCheques) },
        ]}
      />
      <Card index={2} href="/wallet" title="Cash" icon={Wallet} tone="green" stats={[{ label: "To confirm", value: money(s.cashToConfirmPaise) }]} />
    </Cards>
  );
}

export async function LogisticsHome({
  user,
  firmIds,
}: {
  user: { id: string; role: string | null | undefined };
  firmIds: string[];
}) {
  if (firmIds.length === 0) return <EmptyState title="No firm" />;
  const s = await getLogisticsHome(user, firmIds);
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

export async function AdminHome({ firmIds }: { firmIds: string[] }) {
  if (firmIds.length === 0) return <EmptyState title="No firm" />;
  const s = await getAdminHome(firmIds);
  return (
    <Cards>
      <Card index={0} href="/orders" title="Today" icon={CalendarDays} tone="orange" stats={[{ label: "Orders", value: num(s.todayOrders) }, { label: "Bags sent", value: num(s.bagsDispatched) }]} />
      <Card index={1} href="/ledger" title="Dues" icon={Banknote} tone="rose" stats={[{ label: "Outstanding", value: money(s.duesPaise) }]} />
      <Card index={2} href="/stock" title="Stock" icon={Package} tone="blue" stats={[{ label: "Bags", value: num(s.stockBags) }]} />
      <Card index={3} href="/wallet" title="Cash" icon={Wallet} tone="green" stats={[{ label: "In hand", value: money(s.cashInHandPaise) }]} />
      <Card index={4} href="/approvals" title="Approvals" icon={BadgeCheck} tone="violet" stats={[{ label: "Waiting", value: num(s.approvals) }]} />
    </Cards>
  );
}

export async function RetailerHome({ userId }: { userId: string }) {
  const s = await getRetailerHome(userId);
  if (!s) return <EmptyState title="No shop linked" />;
  return (
    <Cards>
      <Card index={0} href="/orders" title="My orders" icon={ClipboardList} tone="orange" stats={[{ label: "Open", value: num(s.openOrders) }]} />
      <Card index={1} href="/ledger" title="Balance" icon={Banknote} tone="rose" stats={[{ label: "Due", value: money(s.balancePaise) }]} />
    </Cards>
  );
}
