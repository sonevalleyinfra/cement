import { cashRows, csvFilename } from "@/lib/report-csv";
import { serveCsv } from "@/lib/report-export";
import { reportRange } from "@/lib/report-range";
import { getCashReport } from "@/lib/reports";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const range = reportRange({ from: q.get("from"), to: q.get("to") });
  return serveCsv({
    report: "cash",
    filename: csvFilename("cash", range.from, range.to),
    range,
    build: async () => cashRows(await getCashReport(range), range.from, range.to),
  });
}
