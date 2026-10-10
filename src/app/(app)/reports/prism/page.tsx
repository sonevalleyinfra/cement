import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { formatDate } from "@/lib/datetime";
import { rolesFor } from "@/lib/permissions";
import { PRISM_MODE_LABELS, prismBalanceLabel, prismKindLabel, type PrismPaymentMode } from "@/lib/prism-rules";
import { param, reportRange } from "@/lib/report-range";
import { getPrismStatement } from "@/lib/reports";
import { requireRole } from "@/lib/session";
import { Mismatch, money, ReportFrame, Stats } from "../report-frame";

/** "You owe Prism ₹X" style, short. */
const owed = (p: number) => {
  const l = prismBalanceLabel(p);
  return { label: l.text, value: money(l.amountPaise) };
};

export default async function PrismStatementPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(...rolesFor("viewReports"));
  const sp = await searchParams;
  const range = reportRange({ from: param(sp.from), to: param(sp.to) });
  const s = await getPrismStatement(range);
  const opening = owed(s.openingPaise);
  const closing = owed(s.closingPaise);
  return (
    <ReportFrame title="Prism statement" range={range}>
      <Stats
        items={[
          { label: `Opening · ${opening.label}`, value: opening.value },
          { label: `Closing · ${closing.label}`, value: closing.value },
          { label: "Purchases and more", value: money(s.debitsPaise) },
          { label: "Paid and credits", value: money(-s.creditsPaise) },
        ]}
      />
      {!s.reconciles && <Mismatch />}
      {s.entries.length === 0 ? (
        <EmptyState title="No entries" />
      ) : (
        <DataTable
          columns={[{ label: "Day" }, { label: "Entry", align: "left" }, { label: "Amount" }, { label: "Balance" }]}
          rows={[
            ["", "Opening", "", money(s.openingPaise)],
            ...s.entries.map((e) => {
              const detail = [e.kind === "payment" && e.mode ? PRISM_MODE_LABELS[e.mode as PrismPaymentMode] : "", e.reference, e.kind === "opening" ? "" : e.note]
                .filter(Boolean)
                .join(" · ");
              return [
                <span key="d" className="text-xs font-normal whitespace-nowrap">{formatDate(e.entryDate)}</span>,
                <span key="k" className="flex flex-col">
                  <span>{prismKindLabel(e.kind)}</span>
                  {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
                </span>,
                money(e.amountPaise),
                money(e.balancePaise),
              ];
            }),
          ]}
          total={["", "Closing", "", money(s.closingPaise)]}
        />
      )}
    </ReportFrame>
  );
}
