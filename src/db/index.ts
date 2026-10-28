import dns from "node:dns";
import net from "node:net";

if (net.setDefaultAutoSelectFamily) net.setDefaultAutoSelectFamily(false);

// Windows OS getaddrinfo can fail or timeout on Neon AWS CNAME hostnames.
// Pure Node resolve4 resolves directly in ~30ms without Windows OS getaddrinfo hanging.
if (process.platform === "win32") {
  const cache = new Map<string, string>();
  const origLookup = dns.lookup;
  // @ts-expect-error Windows DNS fix
  dns.lookup = function (hostname: string, options: any, callback: any) {
    let cb = callback;
    let opt = options;
    if (typeof options === "function") {
      cb = options;
      opt = {};
    }
    if (typeof hostname === "string" && hostname.includes("neon.tech")) {
      const cached = cache.get(hostname);
      if (cached) {
        if (opt && opt.all) return cb(null, [{ address: cached, family: 4 }]);
        return cb(null, cached, 4);
      }
      dns.resolve4(hostname, (err, addrs) => {
        if (!err && addrs && addrs[0]) {
          cache.set(hostname, addrs[0]);
          if (opt && opt.all) return cb(null, addrs.map((a) => ({ address: a, family: 4 })));
          return cb(null, addrs[0], 4);
        }
        origLookup(hostname, opt, cb);
      });
      return;
    }
    origLookup(hostname, opt, cb);
  };
}
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
