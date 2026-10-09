import { sql } from "drizzle-orm";
import { db } from "@/db";

// Used by Coolify / Docker to know the app is healthy.
// 200 only if the database answers; 503 otherwise.
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 3000;

export async function GET() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`no answer within ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
      }),
    ]);
    return Response.json({ status: "ok", database: "ok" });
  } catch (error) {
    console.error("[health] Database check failed:", error);
    return Response.json({ status: "error", database: "unreachable" }, { status: 503 });
  } finally {
    clearTimeout(timer);
  }
}
