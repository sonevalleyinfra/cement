import { csvFilename, stockRows } from "@/lib/report-csv";
import { serveCsv } from "@/lib/report-export";
import { reportRange } from "@/lib/report-range";
import { getStockReport } from "@/lib/reports";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const range = reportRange({ from: q.get("from"), to: q.get("to") });
  return serveCsv({
    report: "stock",
    filename: csvFilename("stock", range.from, range.to),
    range,
    build: async () => stockRows(await getStockReport(range), range.from, range.to),
  });
}
