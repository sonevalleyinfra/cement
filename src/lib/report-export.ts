import { db } from "@/db";
import { writeAudit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";
import { hasAnyRole } from "@/lib/roles";
import { rolesFor } from "@/lib/permissions";
import type { ReportRange } from "@/lib/report-range";
import { getSession } from "@/lib/session";

const text = (body: string, status: number) =>
  new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

/** Thrown inside `build` when the address is wrong (e.g. no retailer picked): answered as 400. */
export class BadCsvRequest extends Error {}

/**
 * The CSV download of a report. Checks the session itself (a route must answer 401 / 403,
 * not redirect), builds the rows, writes one activity row for the export, and returns the file.
 * `details` adds the picked retailer / brand to the activity row.
 */
export async function serveCsv(opts: {
  report: string;
  filename: string;
  range: Pick<ReportRange, "from" | "to">;
  build: () => Promise<(string | number)[][]>;
  details?: Record<string, unknown>;
}): Promise<Response> {
  const session = await getSession();
  if (!session) return text("Sign in first", 401);
  if (!hasAnyRole(session.user.role, rolesFor("viewReports"))) return text("Not allowed", 403);

  let body: string;
  try {
    body = toCsv(await opts.build());
  } catch (e) {
    if (e instanceof BadCsvRequest) return text(e.message, 400);
    throw e;
  }
  await writeAudit(db, {
    actorId: session.user.id,
    entity: "report",
    action: "export",
    entityId: opts.report,
    details: { report: opts.report, from: opts.range.from, to: opts.range.to, ...opts.details },
  });
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${opts.filename}"`,
      "cache-control": "no-store",
    },
  });
}
