import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { rolesFor } from "@/lib/permissions";
import { param, reportRange } from "@/lib/report-range";
import { getStockReport } from "@/lib/reports";
import { requireRole } from "@/lib/session";
import { Mismatch, num, ReportFrame, Section, signedNum, Stats } from "../report-frame";

/** A change of bags in a stacked card: "–" when nothing moved, so the card only lists what happened. */
const moved = (v: number) => (v === 0 ? "–" : signedNum(v));

export default async function StockReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(...rolesFor("viewReports"));
  const sp = await searchParams;
  const range = reportRange({ from: param(sp.from), to: param(sp.to) });
  const { now, flows, total } = await getStockReport(range);
  const godownBags = now.byPlace.filter((p) => p.kind === "godown").reduce((n, p) => n + p.bags, 0);
  return (
    <ReportFrame title="Stock" range={range}>
      <Stats
        items={[
          { label: "Bags now", value: num(now.totalBags) },
          { label: "In godowns", value: num(godownBags) },
          { label: "On trucks", value: num(now.totalBags - godownBags) },
          { label: "Places", value: num(now.byPlace.length) },
        ]}
      />
      <Section title="Now by product" />
      {now.byProduct.length === 0 ? (
        <EmptyState title="No stock" />
      ) : (
        <DataTable
          columns={[{ label: "Product" }, { label: "Bags" }]}
          rows={now.byProduct.map((p) => [p.label, num(p.bags)])}
          total={["Total", num(now.totalBags)]}
        />
      )}
      <Section title="Now by place" />
      {now.byPlace.map((place) => (
        <DataTable
          key={place.key}
          columns={[{ label: `${place.label}${place.kind === "vehicle" ? " (truck)" : ""}` }, { label: "Bags" }]}
          rows={place.products.map((p) => [p.label, num(p.bags)])}
          total={["Total", num(place.bags)]}
        />
      ))}
      <Section title="In the dates picked" />
      {!total.reconciles && <Mismatch />}
      {flows.length === 0 ? (
        <EmptyState title="No stock movements" />
      ) : (
        <DataTable
          stacked
          columns={[
            { label: "Product" },
            { label: "Start" },
            { label: "Opening" },
            { label: "Bought" },
            { label: "Sent" },
            { label: "Moved" },
            { label: "Fixed" },
            { label: "End" },
          ]}
          rows={flows.map((f) => [
            <span key="n" className={f.reconciles ? "" : "text-rose-700"}>
              {f.label}
              {f.reconciles ? "" : " ⚠"}
            </span>,
            num(f.openingBags),
            moved(f.openingStockBags),
            moved(f.purchasedBags),
            moved(-f.dispatchedBags),
            moved(f.movedBags),
            moved(f.fixedBags),
            num(f.closingBags),
          ])}
          total={[
            "Total",
            num(total.openingBags),
            moved(total.openingStockBags),
            moved(total.purchasedBags),
            moved(-total.dispatchedBags),
            moved(total.movedBags),
            moved(total.fixedBags),
            num(total.closingBags),
          ]}
        />
      )}
    </ReportFrame>
  );
}
