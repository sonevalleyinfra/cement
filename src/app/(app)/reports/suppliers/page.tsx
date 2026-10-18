import { Factory } from "lucide-react";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { FilterSelect } from "@/components/app/range-form";
import { hasManyBrands } from "@/lib/catalogue-rules";
import { formatDate } from "@/lib/datetime";
import { rolesFor } from "@/lib/permissions";
import { param, reportRange } from "@/lib/report-range";
import { getSupplierStatement } from "@/lib/reports";
import { requireRole } from "@/lib/session";
import {
  SUPPLIER_MODE_LABELS,
  supplierBalanceLabel,
  supplierKindLabel,
  startSupplier,
  type SupplierPaymentMode,
} from "@/lib/supplier-rules";
import { supplierOptions } from "@/lib/suppliers";
import { Mismatch, money, ReportFrame, Stats } from "../report-frame";

/** One brand's supplier statement. The brand picker shows only when there is more than one supplier. */
export default async function SupplierStatementPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(...rolesFor("viewReports"));
  const sp = await searchParams;
  const range = reportRange({ from: param(sp.from), to: param(sp.to) });
  const suppliers = await supplierOptions();
  // Opens on the supplier with entries (Prism today), not an empty brand.
  const brandId = startSupplier(suppliers, param(sp.brand));
  const brand = suppliers.find((s) => s.id === brandId);
  const s = brand ? await getSupplierStatement(brand.id, range) : null;
  /** "You owe Prism ₹X" style, short. */
  const owed = (p: number) => {
    const l = supplierBalanceLabel(brand?.name ?? "", p);
    return { label: l.text, value: money(l.amountPaise) };
  };

  return (
    <ReportFrame
      title="Supplier statement"
      range={range}
      keep={brand && !hasManyBrands(suppliers) ? { brand: brand.id } : undefined}
      filters={
        hasManyBrands(suppliers) ? (
          <FilterSelect
            name="brand"
            label="Supplier"
            value={brand?.id ?? ""}
            options={suppliers.map((b) => ({ value: b.id, label: b.name }))}
          />
        ) : undefined
      }
    >
      {!brand || !s ? (
        <EmptyState title="No suppliers" icon={Factory} tone="amber" />
      ) : (
        <>
          <Stats
            items={[
              { label: `Opening · ${owed(s.openingPaise).label}`, value: owed(s.openingPaise).value },
              { label: `Closing · ${owed(s.closingPaise).label}`, value: owed(s.closingPaise).value },
              { label: "Purchases and more", value: money(s.debitsPaise) },
              { label: "Paid and credits", value: money(-s.creditsPaise) },
            ]}
          />
          {!s.reconciles && <Mismatch />}
          {s.entries.length === 0 ? (
            <EmptyState title="No entries" />
          ) : (
            <DataTable
              stacked
              columns={[{ label: "Entry" }, { label: "Day" }, { label: "Amount" }, { label: "Balance" }]}
              rows={[
                ["Opening", "", "", money(s.openingPaise)],
                ...s.entries.map((e) => {
                  const detail = [
                    e.kind === "payment" && e.mode ? SUPPLIER_MODE_LABELS[e.mode as SupplierPaymentMode] : "",
                    e.reference,
                    e.kind === "opening" ? "" : e.note,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return [
                    <span key="k" className="flex flex-col">
                      <span>{supplierKindLabel(e.kind)}</span>
                      {detail && <span className="text-xs font-normal text-muted-foreground">{detail}</span>}
                    </span>,
                    formatDate(e.entryDate),
                    money(e.amountPaise),
                    money(e.balancePaise),
                  ];
                }),
              ]}
              total={["Closing", "", "", money(s.closingPaise)]}
            />
          )}
        </>
      )}
    </ReportFrame>
  );
}
