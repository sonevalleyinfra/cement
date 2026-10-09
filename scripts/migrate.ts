/**
 * Applies pending SQL migrations from /drizzle to the database.
 * Runs on every container start (see docker-entrypoint.sh) and via `pnpm db:migrate`.
 * Exits with code 1 if anything fails, which stops the container from starting.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { env } from "@/env";

async function main() {
  const client = postgres(env.DATABASE_URL, { max: 1, connect_timeout: 10, onnotice: () => {} });
  try {
    console.log("[migrate] Applying migrations from ./drizzle ...");
    await migrate(drizzle({ client }), { migrationsFolder: "drizzle" });
    console.log("[migrate] Database is up to date.");
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error("[migrate] FAILED:", error instanceof Error ? error.message : error);
  // Drizzle wraps the real problem (e.g. "connection refused") in `cause`.
  if (error instanceof Error && error.cause) console.error("[migrate] Cause:", error.cause);
  process.exit(1);
});
