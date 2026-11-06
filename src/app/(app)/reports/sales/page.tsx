import { EmptyState } from "@/components/app/empty-state";
import { DataTable } from "@/components/app/data-table";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { formatINR } from "@/lib/money";
import { rolesFor } from "@/lib/permissions";
import { previousRange } from "@/lib/report-compare";
import { param, rangeQuery, reportRange } from "@/lib/report-range";
import { getSalesReport } from "@/lib/reports";
import { saleValuePaise, type SalesLine, type SaleRow } from "@/lib/sales-report";
import { requireRole } from "@/lib/session";
import { CompareNote, compareOf, money, num, ReportFrame, Section, Stats } from "../report-frame";

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

function DispatchRegister({ dispatches }: { dispatches: SaleRow[] }) {
  if (!dispatches || dispatches.length === 0) return null;
  // Newest dispatches first
  const sorted = [...dispatches].reverse();
  return (
    <>
      <Section title="Dispatch register" />
      <ul className="flex flex-col gap-3">
        {sorted.map((d, i) => {
          const value = saleValuePaise(d.bags, d.ratePaise);
          const from = [d.driverName && `Driver ${d.driverName}`, d.fromPlaceName].filter(Boolean).join(" · ");
          return (
            <li key={i} className="flex flex-col gap-1 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 rounded-md bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                    {d.vehicleNumber || "Truck"}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{formatDateTime(d.createdAt)}</span>
                </div>
                <span className={`tabular shrink-0 text-sm font-bold ${d.bags < 0 ? "text-destructive" : ""}`}>
                  {formatINR(value)}
                </span>
              </div>
              <div className="mt-1 text-sm font-semibold">
                {d.retailerName}
                {d.retailerPlace && <span className="font-normal text-muted-foreground"> · {d.retailerPlace}</span>}
              </div>
              <div className="tabular text-xs text-muted-foreground">
                {d.productName} · {d.bags} bags @ {formatINR(d.ratePaise)}/bag
              </div>
              {from && <div className="text-xs text-muted-foreground">{from}</div>}
            </li>
          );
        })}
      </ul>
    </>
  );
}

export default async function SalesReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(...rolesFor("viewReports"));
  const sp = await searchParams;
  const range = reportRange({ from: param(sp.from), to: param(sp.to) });
  const [r, before] = await Promise.all([getSalesReport(range), getSalesReport(previousRange(range))]);
  return (
    <ReportFrame title="Sales" range={range} csvHref={`/reports/sales/csv?${rangeQuery(range)}`}>
      <Stats
        items={[
          { label: "Value", value: money(r.valuePaise), compare: compareOf(r.valuePaise, before.valuePaise, money) },
          { label: "Bags", value: num(r.bags), compare: compareOf(r.bags, before.bags, num) },
          { label: "Dispatches", value: num(r.loads), compare: compareOf(r.loads, before.loads, num) },
        ]}
      />
      <CompareNote range={range} />
      {r.loads === 0 ? (
        <EmptyState title="No dispatches" />
      ) : (
        <>
          <DispatchRegister dispatches={r.dispatches} />
          <Lines title="By vehicle" label="Vehicle" lines={r.byVehicle} total={r} />
          <Lines title="By product" label="Product" lines={r.byProduct} total={r} />
          <Lines title="By retailer" label="Retailer" lines={r.byRetailer} total={r} />
          <Lines title="By sales person" label="Sales person" lines={r.bySalesPerson} total={r} />
          <Lines title="By day" label="Day" lines={r.byDay} total={r} day />
        </>
      )}
    </ReportFrame>
  );
}
