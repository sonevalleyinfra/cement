import { csvFilename, duesRows } from "@/lib/report-csv";
import { serveCsv } from "@/lib/report-export";
import { reportRange } from "@/lib/report-range";
import { getDuesAging } from "@/lib/reports";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const range = reportRange({ from: q.get("from"), to: q.get("to") });
  return serveCsv({
    report: "dues",
    filename: csvFilename("dues", range.from, range.to),
    range,
    build: async () => duesRows(await getDuesAging(range), range.to),
  });
}
