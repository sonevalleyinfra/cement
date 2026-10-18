import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { rolesFor } from "@/lib/permissions";
import { param, reportRange } from "@/lib/report-range";
import { getCashReport } from "@/lib/reports";
import { requireRole } from "@/lib/session";
import { daysText } from "@/lib/words";
import { money, num, ReportFrame, Section, Stats } from "../report-frame";

export default async function CashReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(...rolesFor("viewReports"));
  const sp = await searchParams;
  const range = reportRange({ from: param(sp.from), to: param(sp.to) });
  const r = await getCashReport(range);
  const m = r.byMode;
  return (
    <ReportFrame title="Cash and online" range={range}>
      <Stats
        items={[
          { label: "Cash held by staff", value: money(r.heldPaise) },
          { label: "Online to verify", value: num(r.online.count) },
          { label: "Waiting amount", value: money(r.online.amountPaise) },
          { label: "Oldest waiting", value: r.online.oldestDays === null ? "–" : daysText(r.online.oldestDays) },
        ]}
      />
      <Section title="Cash held now" />
      {r.holders.length === 0 ? (
        <EmptyState title="No cash held" />
      ) : (
        <DataTable
          columns={[{ label: "Staff" }, { label: "Held" }, { label: "Handing over" }]}
          rows={r.holders.map((h) => [h.name, money(h.heldPaise), h.waitingPaise ? money(h.waitingPaise) : "–"])}
          total={["Total", money(r.heldPaise), money(r.holders.reduce((n, h) => n + h.waitingPaise, 0))]}
        />
      )}
      <Section title="Payments recorded in the dates picked" />
      <DataTable
        columns={[{ label: "Mode" }, { label: "Count" }, { label: "Amount" }]}
        rows={[
          ["Cash", num(m.cash.count), money(m.cash.paise)],
          ["Online verified", num(m.onlineVerified.count), money(m.onlineVerified.paise)],
          ["Online waiting", num(m.onlineWaiting.count), money(m.onlineWaiting.paise)],
        ]}
        total={["Total", num(m.total.count), money(m.total.paise)]}
      />
      {(m.reversed.count > 0 || m.rejected.count > 0) && (
        <>
          <Section title="Not counted" />
          <DataTable
            columns={[{ label: "State" }, { label: "Count" }, { label: "Amount" }]}
            rows={[
              ["Reversed", num(m.reversed.count), money(m.reversed.paise)],
              ["Rejected", num(m.rejected.count), money(m.rejected.paise)],
            ]}
          />
        </>
      )}
    </ReportFrame>
  );
}
