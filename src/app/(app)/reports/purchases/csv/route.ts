import { csvFilename, purchaseRows } from "@/lib/report-csv";
import { serveCsv } from "@/lib/report-export";
import { reportRange } from "@/lib/report-range";
import { getPurchaseReport } from "@/lib/reports";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const range = reportRange({ from: q.get("from"), to: q.get("to") });
  return serveCsv({
    report: "purchases",
    filename: csvFilename("purchases", range.from, range.to),
    range,
    build: async () => purchaseRows(await getPurchaseReport(range), range.from, range.to),
  });
}
