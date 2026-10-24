import { isUuid } from "@/lib/ids";
import { csvFilename, statementRows } from "@/lib/report-csv";
import { BadCsvRequest, serveCsv } from "@/lib/report-export";
import { reportRange } from "@/lib/report-range";
import { getRetailerStatement, retailerOptions } from "@/lib/reports";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const range = reportRange({ from: q.get("from"), to: q.get("to") });
  const retailerId = q.get("retailer") ?? "";
  return serveCsv({
    report: "statement",
    filename: csvFilename("statement", range.from, range.to),
    range,
    details: isUuid(retailerId) ? { retailerId } : undefined,
    build: async () => {
      const shop = isUuid(retailerId) ? (await retailerOptions()).find((s) => s.id === retailerId) : undefined;
      if (!shop) throw new BadCsvRequest("Pick a retailer");
      return statementRows(shop.name, range.from, range.to, await getRetailerStatement(shop.id, range));
    },
  });
}
