import { isUuid } from "@/lib/ids";
import { csvFilename, supplierRows } from "@/lib/report-csv";
import { BadCsvRequest, serveCsv } from "@/lib/report-export";
import { reportRange } from "@/lib/report-range";
import { getSupplierStatement } from "@/lib/reports";
import { startSupplier } from "@/lib/supplier-rules";
import { supplierOptions } from "@/lib/suppliers";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const range = reportRange({ from: q.get("from"), to: q.get("to") });
  const picked = q.get("brand") ?? "";
  return serveCsv({
    report: "suppliers",
    filename: csvFilename("supplier", range.from, range.to),
    range,
    details: isUuid(picked) ? { brandId: picked } : undefined,
    build: async () => {
      const suppliers = await supplierOptions();
      const brand = suppliers.find((s) => s.id === startSupplier(suppliers, picked));
      if (!brand) throw new BadCsvRequest("No suppliers");
      return supplierRows(brand.name, range.from, range.to, await getSupplierStatement(brand.id, range));
    },
  });
}
