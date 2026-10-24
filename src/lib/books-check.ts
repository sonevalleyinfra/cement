/**
 * Runs the books check queries (lib/books-check-queries.ts, SELECT only: this file never writes)
 * and returns one result per check (see books-check-rules.ts).
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { activityLogQuery, QUERIES } from "./books-check-queries";
import { activityLogCutoff, ROW_CAP, type BooksRow, type CheckId, type CheckResult } from "./books-check-rules";

type Counted = BooksRow & { total: number | string };

/** Up to ROW_CAP offending rows plus the full count (the window count is taken before the limit). */
async function runOne(id: CheckId, query: SQL): Promise<CheckResult> {
  try {
    const rows = (await db.execute(
      sql`select x.*, count(*) over () total from (${query}) x order by x.what limit ${ROW_CAP}`,
    )) as unknown as Counted[];
    return {
      id,
      total: rows.length === 0 ? 0 : Number(rows[0].total),
      rows: rows.map((r) => ({ kind: r.kind, ref: r.ref, what: r.what, unit: r.unit, got: r.got, want: r.want })),
    };
  } catch (error) {
    console.error(`Books check ${id} could not run`, error);
    return { id, error: true };
  }
}

async function runActivityLog(): Promise<CheckResult> {
  try {
    const [first] = (await db.execute(sql`select min(created_at) as first_at from audit_log`)) as unknown as {
      first_at: Date | string | null;
    }[];
    const since = activityLogCutoff(first?.first_at);
    if (!since) return { id: "I12", total: 0, rows: [] };
    return runOne("I12", activityLogQuery(since));
  } catch (error) {
    console.error("Books check I12 could not run", error);
    return { id: "I12", error: true };
  }
}

/** Runs every check. A check whose query fails comes back as an error, never as passed. */
export async function runBooksCheck(): Promise<CheckResult[]> {
  return Promise.all([
    ...Object.entries(QUERIES).map(([id, q]) => runOne(id as CheckId, q)),
    runActivityLog(),
  ]);
}
