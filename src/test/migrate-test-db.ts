/**
 * Runs once before the tests. When TEST_DATABASE_URL is set (GitHub checks, or by hand), it brings
 * that database up to date with every migration in /drizzle, so the `*.db.test.ts` files run
 * against the real tables and triggers. Without it nothing happens and those tests are skipped.
 *
 * Test-only: reads the url straight from the environment (src/env.ts would ask for the app's own
 * variables). Never point TEST_DATABASE_URL at a real database: the tests leave rows behind.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    // GitHub's database check sets this, so it can never pass by quietly skipping the tests.
    if (process.env.REQUIRE_DB_TESTS) throw new Error("REQUIRE_DB_TESTS is set but TEST_DATABASE_URL is missing.");
    return;
  }
  const client = postgres(url, { max: 1, connect_timeout: 30, onnotice: () => {} });
  try {
    await migrate(drizzle({ client }), { migrationsFolder: "drizzle" });
  } finally {
    await client.end();
  }
}
