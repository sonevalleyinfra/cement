import { EmptyState } from "@/components/app/empty-state";
import { DataTable } from "@/components/app/data-table";
import { formatDate } from "@/lib/datetime";
import { rolesFor } from "@/lib/permissions";
import { param, reportRange } from "@/lib/report-range";
import { getSalesReport } from "@/lib/reports";
import type { SalesLine } from "@/lib/sales-report";
import { requireRole } from "@/lib/session";
import { money, num, ReportFrame, Section, Stats } from "../report-frame";

function Lines({
  title,
  label,
  lines,
  total,
  day,
}: {
  title: string;
  label: string;
  lines: SalesLine[];
  total: { bags: number; valuePaise: number };
  day?: boolean;
}) {
  return (
    <>
      <Section title={title} />
      <DataTable
        columns={[{ label }, { label: "Bags" }, { label: "Value" }]}
        rows={lines.map((l) => [day ? formatDate(`${l.key}T12:00:00+05:30`) : l.label, num(l.bags), money(l.valuePaise)])}
        total={["Total", num(total.bags), money(total.valuePaise)]}
      />
    </>
  );
}

export default async function SalesReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(...rolesFor("viewReports"));
  const sp = await searchParams;
  const range = reportRange({ from: param(sp.from), to: param(sp.to) });
  const r = await getSalesReport(range);
  return (
    <ReportFrame title="Sales" range={range}>
      <Stats
        items={[
          { label: "Value", value: money(r.valuePaise) },
          { label: "Bags", value: num(r.bags) },
          { label: "Dispatches", value: num(r.loads) },
        ]}
      />
      {r.loads === 0 ? (
        <EmptyState title="No dispatches" />
      ) : (
        <>
          <Lines title="By product" label="Product" lines={r.byProduct} total={r} />
          <Lines title="By retailer" label="Retailer" lines={r.byRetailer} total={r} />
          <Lines title="By sales person" label="Sales person" lines={r.bySalesPerson} total={r} />
          <Lines title="By day" label="Day" lines={r.byDay} total={r} day />
        </>
      )}
    </ReportFrame>
  );
}
