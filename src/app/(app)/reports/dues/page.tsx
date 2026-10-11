import Link from "next/link";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { formatDate } from "@/lib/datetime";
import { AGING_LABELS, bucketsTotal, type AgingBuckets } from "@/lib/due-items";
import { rolesFor } from "@/lib/permissions";
import { istStartOf, param, rangeQuery, reportRange } from "@/lib/report-range";
import { getDuesAging } from "@/lib/reports";
import { requireRole } from "@/lib/session";
import { Mismatch, money, num, ReportFrame, Section, Stats } from "../report-frame";

const KEYS = Object.keys(AGING_LABELS) as (keyof AgingBuckets)[];

export default async function DuesReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(...rolesFor("viewReports"));
  const sp = await searchParams;
  const range = reportRange({ from: param(sp.from), to: param(sp.to) });
  const d = await getDuesAging(range);
  const q = rangeQuery(range);
  const adds = d.lines.every((l) => bucketsTotal(l.buckets) === l.duePaise) && bucketsTotal(d.total.buckets) === d.total.duePaise;
  return (
    <ReportFrame title="Dues and aging" range={range}>
      <Stats
        items={[
          { label: `Due on ${formatDate(istStartOf(range.to))}`, value: money(d.total.duePaise) },
          { label: "Retailers", value: num(d.lines.length) },
          ...KEYS.map((k) => ({ label: `${AGING_LABELS[k]} days`, value: money(d.total.buckets[k]) })),
        ]}
      />
      {!adds && <Mismatch />}
      {d.lines.length === 0 ? (
        <EmptyState title="No dues" />
      ) : (
        <DataTable
          stacked
          columns={[{ label: "Retailer" }, { label: "Due" }, ...KEYS.map((k) => ({ label: `${AGING_LABELS[k]} days` }))]}
          rows={d.lines.map((l) => [
            <Link
              key="n"
              href={`/reports/statement?retailer=${l.retailerId}&${q}`}
              className="-my-2 flex min-h-12 items-center underline-offset-2 hover:underline"
            >
              {l.name}
            </Link>,
            money(l.duePaise),
            ...KEYS.map((k) => (l.buckets[k] ? money(l.buckets[k]) : "–")),
          ])}
          total={["Total", money(d.total.duePaise), ...KEYS.map((k) => money(d.total.buckets[k]))]}
        />
      )}
      {d.advances.length > 0 && (
        <>
          <Section title="Advances" />
          <DataTable
            columns={[{ label: "Retailer" }, { label: "Advance" }]}
            rows={d.advances.map((a) => [a.name, money(a.advancePaise)])}
            total={["Total", money(d.advancesPaise)]}
          />
        </>
      )}
    </ReportFrame>
  );
}
