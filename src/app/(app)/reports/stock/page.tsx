import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { rolesFor } from "@/lib/permissions";
import { param, rangeQuery, reportRange } from "@/lib/report-range";
import { getStockReport } from "@/lib/reports";
import { requireRole } from "@/lib/session";
import { Mismatch, num, ReportFrame, Section, signedNum, Stats } from "../report-frame";

/** A change of bags in a stacked card: "–" when nothing moved, so the card only lists what happened. */
const moved = (v: number) => (v === 0 ? "–" : signedNum(v));

/** Bags in or out of a place in a stacked card: "–" when none, so the card only lists what happened. */
const bagsOrDash = (v: number) => (v === 0 ? "–" : num(v));

/** Transfers between places: "+30 / −30" (in / out), "–" when nothing moved. Net is 0 per product, so the net alone hides moves. */
const movedPair = (inBags: number, outBags: number) => (inBags === 0 && outBags === 0 ? "–" : `+${num(inBags)} / −${num(outBags)}`);

export default async function StockReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(...rolesFor("viewReports"));
  const sp = await searchParams;
  const range = reportRange({ from: param(sp.from), to: param(sp.to) });
  const { now, flows, total, places, placesTotal } = await getStockReport(range);
  const godownBags = now.byPlace.filter((p) => p.kind === "godown").reduce((n, p) => n + p.bags, 0);
  return (
    <ReportFrame title="Stock" range={range} csvHref={`/reports/stock/csv?${rangeQuery(range)}`}>
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
      <Section title="By place, dates picked" />
      {!placesTotal.reconciles && <Mismatch />}
      {places.length === 0 ? (
        <EmptyState title="No stock movements" />
      ) : (
        <DataTable
          stacked
          columns={[{ label: "Place" }, { label: "Opening" }, { label: "In" }, { label: "Out" }, { label: "Closing" }]}
          rows={places.map((p) => [
            <span key="n" className={p.reconciles ? "" : "text-rose-700"}>
              {p.label}
              {p.kind === "vehicle" ? " (truck)" : ""}
              {p.reconciles ? "" : " ⚠"}
            </span>,
            num(p.openingBags),
            bagsOrDash(p.inBags),
            bagsOrDash(p.outBags),
            num(p.closingBags),
          ])}
          total={["Total", num(placesTotal.openingBags), bagsOrDash(placesTotal.inBags), bagsOrDash(placesTotal.outBags), num(placesTotal.closingBags)]}
        />
      )}
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
            { label: "± moved" },
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
            movedPair(f.movedInBags, f.movedOutBags),
            moved(f.fixedBags),
            num(f.closingBags),
          ])}
          total={[
            "Total",
            num(total.openingBags),
            moved(total.openingStockBags),
            moved(total.purchasedBags),
            moved(-total.dispatchedBags),
            movedPair(total.movedInBags, total.movedOutBags),
            moved(total.fixedBags),
            num(total.closingBags),
          ]}
        />
      )}
    </ReportFrame>
  );
}
