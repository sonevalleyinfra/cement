import dns from "node:dns";
import net from "node:net";

if (dns.setDefaultResultOrder) dns.setDefaultResultOrder("ipv4first");
if (net.setDefaultAutoSelectFamily) net.setDefaultAutoSelectFamily(false);

// Windows OS getaddrinfo can fail or timeout on Neon AWS CNAME hostnames.
// Pure Node resolve4 with fallback public DNS resolves directly in ~20ms.
if (process.platform === "win32") {
  try {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
  } catch {}
  const cache = new Map<string, string>();
  const origLookup = dns.lookup;
  type LookupCallback = (
    err: NodeJS.ErrnoException | null,
    address: string | dns.LookupAddress[],
    family?: number,
  ) => void;
  dns.lookup = function (
    hostname: string,
    options: dns.LookupOptions | number | null | undefined | LookupCallback,
    callback?: LookupCallback,
  ) {
    let cb = callback as LookupCallback;
    let opt = options as dns.LookupOptions | number | null | undefined;
    if (typeof options === "function") {
      cb = options;
      opt = {};
    }
    const lookupOpt = opt as dns.LookupOptions | null | undefined;
    if (typeof hostname === "string" && hostname.includes("neon.tech")) {
      const cached = cache.get(hostname);
      if (cached) {
        if (lookupOpt && lookupOpt.all) return cb(null, [{ address: cached, family: 4 }]);
        return cb(null, cached, 4);
      }
      dns.resolve4(hostname, (err, addrs) => {
        if (!err && addrs && addrs[0]) {
          cache.set(hostname, addrs[0]);
          if (lookupOpt && lookupOpt.all) return cb(null, addrs.map((a) => ({ address: a, family: 4 })));
          return cb(null, addrs[0], 4);
        }
        origLookup(hostname, opt as dns.LookupOptions, cb as never);
      });
      return;
    }
    origLookup(hostname, opt as dns.LookupOptions, cb as never);
  } as typeof dns.lookup;
}
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
