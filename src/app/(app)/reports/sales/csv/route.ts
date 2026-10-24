import { csvFilename, salesRows } from "@/lib/report-csv";
import { serveCsv } from "@/lib/report-export";
import { reportRange } from "@/lib/report-range";
import { getSalesReport } from "@/lib/reports";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const range = reportRange({ from: q.get("from"), to: q.get("to") });
  return serveCsv({
    report: "sales",
    filename: csvFilename("sales", range.from, range.to),
    range,
    build: async () => salesRows(await getSalesReport(range)),
  });
}
