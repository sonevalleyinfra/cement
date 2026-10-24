import { BookOpen } from "lucide-react";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { ShopPicker } from "@/components/app/shop-picker";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { isUuid } from "@/lib/ids";
import { ledgerEntryLabel } from "@/lib/ledger-view-rules";
import { rolesFor } from "@/lib/permissions";
import { param, reportRange } from "@/lib/report-range";
import { getRetailerStatement, retailerOptions } from "@/lib/reports";
import { requireRole } from "@/lib/session";
import { Mismatch, money, ReportFrame, Stats } from "../report-frame";

/** A balance in words: "Due ₹500" / "Advance ₹200". */
const balance = (p: number) => (p < 0 ? `Advance ${money(-p)}` : money(p));

export default async function RetailerStatementPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(...rolesFor("viewReports"));
  const sp = await searchParams;
  const range = reportRange({ from: param(sp.from), to: param(sp.to) });
  const shops = await retailerOptions();
  const picked = param(sp.retailer);
  const shop = isUuid(picked) ? shops.find((s) => s.id === picked) : undefined;
  const s = shop ? await getRetailerStatement(shop.id, range) : null;

  return (
    <ReportFrame
      title="Statement"
      range={range}
      filters={
        <ShopPicker name="retailer" label="Retailer" value={shop?.id ?? ""} shops={shops} />
      }
    >
      {!shop || !s ? (
        <EmptyState title="Pick a retailer" icon={BookOpen} tone="rose" />
      ) : (
        <>
          <Stats
            items={[
              { label: `Opening ${formatDate(range.start)}`, value: balance(s.openingPaise) },
              { label: `Closing ${formatDate(new Date(range.end.getTime() - 1))}`, value: balance(s.closingPaise) },
              { label: "Billed", value: money(s.debitsPaise) },
              { label: "Paid / credited", value: money(-s.creditsPaise) },
            ]}
          />
          {!s.reconciles && <Mismatch />}
          <DataTable
            columns={[{ label: "When" }, { label: "Entry", align: "left" }, { label: "Amount" }, { label: "Balance" }]}
            rows={[
              ["", "Opening", "", money(s.openingPaise)],
              ...s.entries.map((e) => [
                <span key="d" className="text-xs font-normal">{formatDateTime(e.createdAt)}</span>,
                <span key="k" className="flex flex-col">
                  <span>{ledgerEntryLabel(e.kind, e.amountPaise)}</span>
                  {e.note && <span className="text-xs text-muted-foreground">{e.note}</span>}
                </span>,
                money(e.amountPaise),
                money(e.balancePaise),
              ]),
            ]}
            total={["", "Closing", "", money(s.closingPaise)]}
          />
        </>
      )}
    </ReportFrame>
  );
}
