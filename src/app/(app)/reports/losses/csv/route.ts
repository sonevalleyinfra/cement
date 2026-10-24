import { csvFilename, lossRows } from "@/lib/report-csv";
import { serveCsv } from "@/lib/report-export";
import { reportRange } from "@/lib/report-range";
import { getLossReport } from "@/lib/reports";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const range = reportRange({ from: q.get("from"), to: q.get("to") });
  return serveCsv({
    report: "losses",
    filename: csvFilename("losses", range.from, range.to),
    range,
    build: async () => lossRows(await getLossReport(range), range.from, range.to),
  });
}
