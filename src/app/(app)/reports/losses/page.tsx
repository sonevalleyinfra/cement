import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import type { LossLine } from "@/lib/loss-report";
import { rolesFor } from "@/lib/permissions";
import { param, rangeQuery, reportRange } from "@/lib/report-range";
import { getLossReport } from "@/lib/reports";
import { requireRole } from "@/lib/session";
import { money, num, ReportFrame, Section, Stats } from "../report-frame";

function Lines({ title, label, lines, total }: { title: string; label: string; lines: LossLine[]; total: { bags: number; valuePaise: number } }) {
  return (
    <>
      <Section title={title} />
      <DataTable
        stacked
        columns={[{ label }, { label: "Bags" }, { label: "Value" }]}
        rows={lines.map((l) => [l.label, num(l.bags), money(l.valuePaise)])}
        total={["Total", num(total.bags), money(total.valuePaise)]}
      />
    </>
  );
}

export default async function LossReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(...rolesFor("viewReports"));
  const sp = await searchParams;
  const range = reportRange({ from: param(sp.from), to: param(sp.to) });
  const r = await getLossReport(range);
  return (
    <ReportFrame title="Damage and loss" range={range} csvHref={`/reports/losses/csv?${rangeQuery(range)}`}>
      <Stats
        items={[
          { label: "Lost bags", value: num(r.total.bags) },
          { label: "Value", value: money(r.total.valuePaise) },
          ...(r.total.unvaluedBags > 0 ? [{ label: "No cost (bags)", value: num(r.total.unvaluedBags) }] : []),
        ]}
      />
      {r.total.entries === 0 ? (
        <EmptyState title="No losses" />
      ) : (
        <>
          <Lines title="By reason" label="Reason" lines={r.byReason} total={r.total} />
          <Lines
            title="By place"
            label="Place"
            lines={r.byPlace.map((p) => ({ ...p, label: p.kind === "vehicle" ? `${p.label} (truck)` : p.label }))}
            total={r.total}
          />
        </>
      )}
    </ReportFrame>
  );
}
