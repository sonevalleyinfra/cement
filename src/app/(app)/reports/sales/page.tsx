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
      <Section title="Dispatch Register" />
      <ul className="flex flex-col gap-2.5">
        {sorted.map((d, i) => {
          const value = saleValuePaise(d.bags, d.ratePaise);
          return (
            <li
              key={i}
              className="flex flex-col gap-1.5 rounded-2xl bg-card p-3.5 shadow-card ring-1 ring-foreground/6"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary tracking-wide">
                    {d.vehicleNumber || "Truck"}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(d.createdAt)}</span>
                </div>
                <span className={`tabular text-sm font-bold ${d.bags < 0 ? "text-destructive" : ""}`}>
                  {formatINR(value)}
                </span>
              </div>

              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-sm">
                  {d.retailerName}
                  {d.retailerPlace && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">({d.retailerPlace})</span>
                  )}
                </span>
                <span className="tabular text-xs font-medium text-foreground">
                  {d.bags} bags @ {formatINR(d.ratePaise)}/bag
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{d.productName}</span>
                <span>
                  {d.driverName ? `Driver: ${d.driverName}` : ""}
                  {d.fromPlaceName ? ` · From: ${d.fromPlaceName}` : ""}
                </span>
              </div>
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
