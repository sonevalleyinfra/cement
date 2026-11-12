import { CallButton } from "@/components/app/call-button";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { formatINR } from "@/lib/money";
import { rolesFor } from "@/lib/permissions";
import type { PurchaseGroupLine, PurchaseRegisterRow } from "@/lib/purchase-report";
import { previousRange } from "@/lib/report-compare";
import { param, rangeQuery, reportRange } from "@/lib/report-range";
import { getPurchaseReport } from "@/lib/reports";
import { requireRole } from "@/lib/session";
import { cn } from "@/lib/utils";
import { CompareNote, compareOf, money, num, ReportFrame, Section, Stats } from "../report-frame";

function GroupTable({ title, label, rows }: { title: string; label: string; rows: PurchaseGroupLine[] }) {
  if (rows.length === 0) return null;
  const totalPurchases = rows.reduce((s, r) => s + r.purchases, 0);
  const totalNet = rows.reduce((s, r) => s + r.netBags, 0);
  const totalValue = rows.reduce((s, r) => s + r.totalLandedPaise, 0);
  return (
    <>
      <Section title={title} />
      <DataTable
        columns={[{ label }, { label: "Bills" }, { label: "Net bags" }, { label: "Landed value" }]}
        rows={rows.map((l) => [l.label, num(l.purchases), num(l.netBags), money(l.totalLandedPaise)])}
        total={["Total", num(totalPurchases), num(totalNet), money(totalValue)]}
      />
    </>
  );
}

function statusBadgeClass(status: PurchaseRegisterRow["tripStatus"]): string {
  switch (status) {
    case "Completed (0 left)":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "Active":
      return "bg-blue-500/15 text-blue-700 dark:text-blue-300";
    case "Superseded":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-300";
    case "Godown":
      return "bg-muted text-muted-foreground";
  }
}

function PurchaseCard({ p }: { p: PurchaseRegisterRow }) {
  const lost = p.shortBags + p.burstBags;
  return (
    <li className="flex flex-col gap-2.5 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6">
      {/* Header: Truck No, Entry Time, Status, Value */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="shrink-0 rounded-md bg-accent px-2 py-0.5 text-xs font-bold tracking-wide text-accent-foreground">
            {p.truckNumber}
          </span>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold", statusBadgeClass(p.tripStatus))}>
            {p.tripStatus}
          </span>
          <span className="truncate text-xs text-muted-foreground">{formatDateTime(p.createdAt)}</span>
        </div>
        <span className="tabular shrink-0 text-sm font-bold">{formatINR(p.totalLandedPaise)}</span>
      </div>

      {/* Product, Brand, Source, Invoice */}
      <div>
        <div className="text-sm font-semibold">
          {p.productName} <span className="font-normal text-muted-foreground">· {p.sourceLabel}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          Invoice <span className="font-medium text-foreground">{p.invoiceNo}</span> · {formatDate(p.invoiceDate)} · {p.placeName} · By {p.actorName}
        </div>
      </div>

      {/* Driver + Quick Call */}
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Driver: <span className="font-medium text-foreground">{p.driverName || "—"}</span>
          {p.driverPhone ? ` · ${p.driverPhone}` : ""}
        </span>
        {p.driverPhone && <CallButton phone={p.driverPhone} label={`Call ${p.driverName || p.truckNumber}`} className="-my-2 -mr-2" />}
      </div>

      {/* Bags & Cost Breakdown */}
      <div className="rounded-xl bg-muted/40 px-3 py-2 text-xs">
        <div className="tabular flex flex-wrap gap-x-4 gap-y-1 font-medium text-foreground">
          <span>Billed: {num(p.billedBags)}</span>
          <span>Received: {num(p.receivedBags)}</span>
          {lost > 0 && <span className="text-amber-700 dark:text-amber-300">Short/Burst: {num(lost)} ({p.claimLabel})</span>}
          {p.reversedBags > 0 && <span className="text-destructive">Reversed: {num(p.reversedBags)}</span>}
          <span>Net: {num(p.netBags)} bags</span>
        </div>
        <div className="tabular mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
          <span>Rate: {formatINR(p.unitCostPaise)}</span>
          {p.freightPaise > 0 && <span>Freight: {formatINR(p.freightPaise)}</span>}
          {p.unloadingPaise > 0 && <span>Unloading: {formatINR(p.unloadingPaise)}</span>}
          <span>Landed/bag: {formatINR(p.landedUnitCostPaise)}</span>
        </div>
      </div>

      {/* Truck Purchase-to-Dispatch Traceability (until 0 bags) */}
      <div className="border-t border-foreground/8 pt-2">
        <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
          <span>Truck Journey (Where bags went)</span>
          <span className="tabular text-muted-foreground">
            Sent {num(p.dispatchedBagsFromTrip)}
            {p.transferredToGodownBags > 0 ? ` · Godown ${num(p.transferredToGodownBags)}` : ""}
            {` · Left ${num(p.remainingBagsFromTrip)}`}
          </span>
        </div>

        {p.steps.length === 0 ? (
          <p className="text-xs text-muted-foreground">No dispatches or godown unloads recorded yet from this purchase.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {p.steps.map((s, idx) => {
              if (s.kind === "dispatch") {
                const dest =
                  s.deliverTo === "site"
                    ? `Site${s.siteAddress ? `: ${s.siteAddress}` : ""}`
                    : s.retailerPlace || "Shop";
                return (
                  <li key={idx} className="flex flex-col gap-0.5 rounded-xl bg-muted/25 px-3 py-2 text-xs ring-1 ring-foreground/5">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("font-semibold", s.bags < 0 && "text-destructive")}>
                        {s.bags < 0 ? `Returned ${num(-s.bags)} bags` : `${num(s.bags)} bags`} → {s.retailerName}
                      </span>
                      <span className="tabular font-semibold">{formatINR(s.valuePaise)}</span>
                    </div>
                    <div className="text-muted-foreground">
                      {formatDateTime(s.at)} · {dest} · @ {formatINR(s.ratePaise)}/bag
                      {s.receiverName ? ` · Recv: ${s.receiverName}${s.receiverPhone ? ` (${s.receiverPhone})` : ""}` : ""}
                      {s.salesRepName ? ` · Sales: ${s.salesRepName}` : ""}
                      {` · By ${s.actorName}`}
                      {s.reasonLabel ? ` · ${s.reasonLabel}` : ""}
                    </div>
                  </li>
                );
              }
              if (s.kind === "transfer_out") {
                return (
                  <li key={idx} className="flex items-center justify-between gap-2 rounded-xl bg-blue-500/8 px-3 py-2 text-xs ring-1 ring-blue-500/20">
                    <span>
                      <strong className="text-blue-700 dark:text-blue-300">{num(s.bags)} bags</strong> unloaded →{" "}
                      <strong>{s.godownName}</strong>
                    </span>
                    <span className="text-muted-foreground">{formatDateTime(s.at)} · {s.actorName}</span>
                  </li>
                );
              }
              return (
                <li key={idx} className="flex items-center justify-between gap-2 rounded-xl bg-amber-500/8 px-3 py-2 text-xs ring-1 ring-amber-500/20">
                  <span>
                    {s.kind === "purchase_reversal" ? `Purchase reversed ${num(s.bags)} bags` : `Adjustment ${s.bags > 0 ? `+${num(s.bags)}` : num(s.bags)} bags`}
                    {s.reasonText ? ` · ${s.reasonText}` : ""}
                  </span>
                  <span className="text-muted-foreground">{formatDateTime(s.at)} · {s.actorName}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </li>
  );
}

export default async function PurchaseReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(...rolesFor("viewReports"));
  const sp = await searchParams;
  const range = reportRange({ from: param(sp.from), to: param(sp.to) });
  const [r, before] = await Promise.all([getPurchaseReport(range), getPurchaseReport(previousRange(range))]);
  const t = r.totals;
  const pt = before.totals;

  return (
    <ReportFrame title="Purchases" range={range} csvHref={`/reports/purchases/csv?${rangeQuery(range)}`}>
      <Stats
        items={[
          { label: "Landed value", value: money(t.totalLandedPaise), compare: compareOf(t.totalLandedPaise, pt.totalLandedPaise, money) },
          { label: "Net bags", value: num(t.netBags), compare: compareOf(t.netBags, pt.netBags, num) },
          { label: "Sent from trucks", value: num(t.dispatchedBags) },
          { label: "Unloaded to godown", value: num(t.transferredToGodownBags) },
        ]}
      />
      <CompareNote range={range} />
      {t.count === 0 ? (
        <EmptyState title="No purchases in these dates" />
      ) : (
        <>
          <Section title="Purchase register & truck journey" />
          <ul className="flex flex-col gap-3">
            {r.purchases.map((p) => (
              <PurchaseCard key={p.id} p={p} />
            ))}
          </ul>
          <GroupTable title="By product" label="Product" rows={r.byProduct} />
          <GroupTable title="By source / plant" label="Source" rows={r.bySource} />
        </>
      )}
    </ReportFrame>
  );
}
