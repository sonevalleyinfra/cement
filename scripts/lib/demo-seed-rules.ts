/**
 * Safety rules for scripts/seed-demo.ts, kept as plain functions so they can be tested.
 * The demo seed creates users with a PUBLIC password, so it must never touch a real database.
 */

/** The shared local demo password. Public on purpose: it only works on a local demo database. */
export const DEMO_PASSWORD = "Demo@12345";

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "[::1]"];

export function isLocalDatabaseUrl(databaseUrl: string): boolean {
  try {
    return LOCAL_HOSTS.includes(new URL(databaseUrl).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Returns an error message if the demo seed must not run here, else null. */
export function demoSeedBlocker(opts: { nodeEnv: string; databaseUrl: string; force: boolean }): string | null {
  if (opts.force) return null;
  if (opts.nodeEnv === "production") {
    return "NODE_ENV is production. The demo seed only runs on a local or preview database (add --force to override).";
  }
  if (!isLocalDatabaseUrl(opts.databaseUrl)) {
    return "The database is not on localhost. The demo seed only runs on a local database (add --force to override).";
  }
  return null;
}

export const DEMO_USERS = [
  { email: "admin@demo.test", name: "Demo Admin", role: "admin", phone: "9100000001" },
  { email: "sales@demo.test", name: "Demo Sales", role: "sales", phone: "9100000002" },
  { email: "accounts@demo.test", name: "Demo Accounts", role: "accounts", phone: "9100000003" },
  { email: "logistics@demo.test", name: "Demo Logistics", role: "logistics", phone: "9100000004" },
  { email: "retailer@demo.test", name: "Demo Retailer", role: "retailer", phone: "9100000005" },
] as const;
