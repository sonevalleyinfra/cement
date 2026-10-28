import "@/lib/dns-patch";
import net from "node:net";
if (net.setDefaultAutoSelectFamily) net.setDefaultAutoSelectFamily(false);
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env";
import * as schema from "./schema";

// Re-use one connection pool across hot reloads in development.
const globalForDb = globalThis as unknown as { pgClient?: postgres.Sql };

const client =
  globalForDb.pgClient ??
  postgres(env.DATABASE_URL, {
    max: 5, // keep the pool small: a small VPS Postgres has limited connections
    connect_timeout: 10,
  });

if (env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle({ client, schema });
export { schema };
