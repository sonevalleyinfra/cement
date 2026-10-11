import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { rolesFor } from "@/lib/permissions";
import { param, reportRange } from "@/lib/report-range";
import { getProfitReport } from "@/lib/reports";
import { requireRole } from "@/lib/session";
import { money, num, ReportFrame, Section, Stats } from "../report-frame";

export default async function ProfitReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(...rolesFor("viewReports"));
  const sp = await searchParams;
  const range = reportRange({ from: param(sp.from), to: param(sp.to) });
  const r = await getProfitReport(range);
  const perBag = (p: number | null) => (p === null ? "–" : money(p));
  return (
    <ReportFrame title="Profit" range={range}>
      <Stats
        items={[
          { label: "Profit", value: money(r.total.profitPaise) },
          { label: "Per bag", value: perBag(r.total.profitPerBagPaise) },
          { label: "Sales", value: money(r.total.salesPaise) },
          { label: "Cost", value: money(r.total.costPaise) },
        ]}
      />
      {r.lines.length === 0 ? (
        <EmptyState title="No dispatches" />
      ) : (
        <DataTable
          stacked
          columns={[
            { label: "Product" },
            { label: "Bags" },
            { label: "Sales" },
            { label: "Avg cost" },
            { label: "Cost" },
            { label: "Profit" },
            { label: "Per bag" },
          ]}
          rows={r.lines.map((l) =>
            l.costPaise === null
              ? [l.label, num(l.bags), money(l.salesPaise), "–", <span key="u" className="text-rose-700">Cost unknown</span>, "–", "–"]
              : [l.label, num(l.bags), money(l.salesPaise), perBag(l.avgCostPaise), money(l.costPaise), money(l.profitPaise ?? 0), perBag(l.profitPerBagPaise)],
          )}
          total={["Total", num(r.total.bags), money(r.total.salesPaise), "", money(r.total.costPaise), money(r.total.profitPaise), perBag(r.total.profitPerBagPaise)]}
        />
      )}
      {r.unknown.products > 0 && (
        <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">
          Cost unknown for {num(r.unknown.products)} {r.unknown.products === 1 ? "product" : "products"} ({num(r.unknown.bags)} bags,{" "}
          {money(r.unknown.salesPaise)} sales): not in the total.
        </p>
      )}
      <Section title="Supplier scheme credits" />
      <Stats items={[{ label: "Credits in the dates picked", value: money(r.schemeCreditsPaise) }]} />
    </ReportFrame>
  );
}
