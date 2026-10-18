import { BookOpen, ChartColumn, Coins, Factory, Hourglass, Package, ShieldCheck, Users, Wallet, type LucideIcon } from "lucide-react";
import { IconTile, type Tone } from "@/components/app/icon-tile";
import { ListCard } from "@/components/app/list-card";
import { PageHeader } from "@/components/app/page-header";
import { RangeForm } from "@/components/app/range-form";
import { Stat } from "@/components/app/stat";
import { rolesFor } from "@/lib/permissions";
import { param, rangeQuery, reportRange } from "@/lib/report-range";
import { getCashHolders, getDuesAging, getProfitReport, getSalesReport, getSupplierClosings } from "@/lib/reports";
import { isAdmin } from "@/lib/roles";
import { requireRole } from "@/lib/session";
import { supplierHomeLines } from "@/lib/supplier-rules";
import { money, num } from "./report-frame";

type Card = { href: string; title: string; icon: LucideIcon; tone: Tone; stats: { label: string; value: string }[] };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireRole(...rolesFor("viewReports"));
  const sp = await searchParams;
  const range = reportRange({ from: param(sp.from), to: param(sp.to) });
  const [sales, dues, cash, suppliers, profit] = await Promise.all([
    getSalesReport(range),
    getDuesAging(range),
    getCashHolders(),
    getSupplierClosings(range),
    getProfitReport(range),
  ]);
  const q = rangeQuery(range);
  const cards: Card[] = [
    { href: `/reports/sales?${q}`, title: "Sales", icon: ChartColumn, tone: "orange", stats: [{ label: "Value", value: money(sales.valuePaise) }, { label: "Bags", value: num(sales.bags) }] },
    { href: `/reports/profit?${q}`, title: "Profit", icon: Coins, tone: "green", stats: [{ label: "Profit", value: money(profit.total.profitPaise) }] },
    { href: `/reports/dues?${q}`, title: "Dues and aging", icon: Hourglass, tone: "rose", stats: [{ label: "Due", value: money(dues.total.duePaise) }, { label: "Over 90 days", value: money(dues.total.buckets.d90plus) }] },
    { href: `/reports/statement?${q}`, title: "Retailer statement", icon: BookOpen, tone: "rose", stats: [] },
    { href: `/reports/stock?${q}`, title: "Stock", icon: Package, tone: "blue", stats: [] },
    { href: `/reports/cash?${q}`, title: "Cash and online", icon: Wallet, tone: "green", stats: [{ label: "Held by staff", value: money(cash.reduce((n, h) => n + h.heldPaise, 0)) }] },
    {
      href: `/reports/suppliers?${q}`,
      title: "Supplier statement",
      icon: Factory,
      tone: "amber",
      stats: supplierHomeLines(suppliers).map((l) => ({ label: l.text, value: money(l.amountPaise) })),
    },
    { href: `/reports/staff?${q}`, title: "Staff activity", icon: Users, tone: "violet", stats: [] },
    ...(isAdmin(session.user.role) ? [{ href: "/reports/books", title: "Books check", icon: ShieldCheck, tone: "slate" as const, stats: [] }] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Reports" />
      <RangeForm from={range.from} to={range.to} />
      <div className="flex flex-col gap-3">
        {cards.map((c, i) => (
          <ListCard
            key={c.href}
            href={c.href}
            index={i}
            title={c.title}
            icon={<IconTile icon={c.icon} tone={c.tone} />}
            bottom={
              c.stats.length > 0 ? (
                <div className="flex w-full min-w-0 flex-wrap gap-x-8 gap-y-2 [overflow-wrap:anywhere]">
                  {c.stats.map((s) => (
                    <Stat key={s.label} label={s.label} value={s.value} />
                  ))}
                </div>
              ) : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}
