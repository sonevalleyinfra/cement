import Link from "next/link";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { getOverrides } from "@/lib/credit-check";
import { overridesByReason, overrideTotals } from "@/lib/credit-check-rules";
import { formatDateTime } from "@/lib/datetime";
import { rolesFor } from "@/lib/permissions";
import { reasonText } from "@/lib/reason-codes";
import { param, reportRange } from "@/lib/report-range";
import { requireRole } from "@/lib/session";
import { money, num, ReportFrame, Section, Stats } from "../report-frame";

/** Orders approved over the credit check (v2 B1): how many, how much over the limit, and why. Admin only. */
export default async function OverridesReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(...rolesFor("viewReports"));
  const sp = await searchParams;
  const range = reportRange({ from: param(sp.from), to: param(sp.to) });
  const rows = await getOverrides(range);
  const total = overrideTotals(rows);
  return (
    <ReportFrame title="Credit overrides" range={range}>
      <Stats
        items={[
          { label: "Overrides", value: num(total.count) },
          { label: "Over limit", value: money(total.overLimitPaise) },
          { label: "Order value", value: money(total.orderPaise) },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState title="No overrides" />
      ) : (
        <>
          <Section title="By reason" />
          <DataTable
            columns={[{ label: "Reason" }, { label: "Overrides" }]}
            rows={overridesByReason(rows).map((r) => [r.label, num(r.count)])}
          />
          <Section title="Orders" />
          <ul className="flex flex-col gap-2">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/orders/${r.orderId}`}
                  className="animate-in-up flex flex-col gap-1 rounded-2xl bg-card p-3 shadow-card ring-1 ring-foreground/6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 font-semibold [overflow-wrap:anywhere]">{r.shop}</span>
                    <span className="tabular shrink-0 text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</span>
                  </div>
                  <dl className="tabular flex flex-col gap-1 text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-muted-foreground">Order</dt>
                      <dd className="font-medium">{money(r.orderPaise)}</dd>
                    </div>
                    {r.overLimitPaise > 0 && (
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-muted-foreground">Over by</dt>
                        <dd className="font-medium text-risk-foreground">{money(r.overLimitPaise)}</dd>
                      </div>
                    )}
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-muted-foreground">Reason</dt>
                      <dd className="text-right font-medium [overflow-wrap:anywhere]">{reasonText(r.reasonCode, r.note, "override")}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-muted-foreground">By</dt>
                      <dd className="text-right font-medium [overflow-wrap:anywhere]">{r.by}</dd>
                    </div>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </ReportFrame>
  );
}
