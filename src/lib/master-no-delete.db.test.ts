/**
 * Shops, trucks and users are never deleted (drizzle/0051). Runs only with TEST_DATABASE_URL
 * (a migrated test database). Nothing here can be cleaned up afterwards, which is the point:
 * every test makes fresh rows with random names.
 */
import { randomBytes, randomInt } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { retailers, user, vehicles } from "@/db/schema";
import { writeAudit } from "@/lib/audit";

// Test-only DB url, read straight from the environment: src/env.ts would ask for the app's own variables.
const url = process.env.TEST_DATABASE_URL;

/** Drizzle wraps the database error; its message is on `cause`. */
async function refusal(run: Promise<unknown>): Promise<string> {
  try {
    await run;
    return "";
  } catch (e) {
    const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : "";
    return cause || (e instanceof Error ? e.message : String(e));
  }
}

describe.skipIf(!url)("shops, trucks and users are never deleted (real database)", () => {
  let client: postgres.Sql;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  const suffix = () => randomBytes(6).toString("hex");

  async function makeUser() {
    const id = `keep-${suffix()}`;
    await db.insert(user).values({ id, name: `Keep ${id}`, email: `${id}@keep.test`, role: "sales" });
    return id;
  }

  async function makeShop(over: Partial<typeof retailers.$inferInsert> = {}) {
    const phone = `8${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
    const [row] = await db.insert(retailers).values({ name: `Keep shop ${suffix()}`, phone, ...over }).returning({ id: retailers.id });
    return row.id;
  }

  const stillThere = async (id: string) => (await db.select({ id: user.id }).from(user).where(eq(user.id, id))).length === 1;

  beforeAll(() => {
    client = postgres(url!, { max: 2, onnotice: () => {} });
    db = drizzle({ client, schema });
  });

  afterAll(async () => {
    await client?.end();
  });

  it("refuses to delete a shop", async () => {
    const shop = await makeShop();
    expect(await refusal(db.delete(retailers).where(eq(retailers.id, shop)))).toMatch(/never deleted/);
    expect(await db.select({ id: retailers.id }).from(retailers).where(eq(retailers.id, shop))).toHaveLength(1);
  });

  it("refuses to delete a truck", async () => {
    const [truck] = await db.insert(vehicles).values({ number: `KP${suffix().toUpperCase()}`, driverName: "Ravi" }).returning({ id: vehicles.id });
    expect(await refusal(db.delete(vehicles).where(eq(vehicles.id, truck.id)))).toMatch(/never deleted/);
    expect(await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, truck.id))).toHaveLength(1);
  });

  it("has the guard against emptying the shops, trucks and users tables switched on", async () => {
    // Read from the database's own list of triggers. A real TRUNCATE is not run here: it locks
    // every linked table, which deadlocks with the other database tests running at the same time.
    const rows = (await db.execute(sql`
      select c.relname as "table"
      from pg_trigger t join pg_class c on c.oid = t.tgrelid
      where t.tgname in ('retailers_no_truncate', 'vehicles_no_truncate', 'user_no_truncate')
        and t.tgenabled = 'O' and (t.tgtype & 32) = 32
      order by c.relname
    `)) as unknown as { table: string }[];
    expect(rows.map((r) => r.table)).toEqual(["retailers", "user", "vehicles"]);
  });

  it("lets a half-made user (no history) be removed", async () => {
    const id = await makeUser();
    await db.delete(user).where(eq(user.id, id));
    expect(await stillThere(id)).toBe(false);
  });

  it("refuses to delete a user the activity log knows", async () => {
    const admin = await makeUser();
    const id = await makeUser();
    await db.transaction((tx) => writeAudit(tx, { actorId: admin, entity: "user", entityId: id, action: "create", details: {} }));
    expect(await refusal(db.delete(user).where(eq(user.id, id)))).toMatch(/has history/);
    expect(await stillThere(id)).toBe(true);
  });

  it("refuses to delete a shop's sales person or a shop's login", async () => {
    const rep = await makeUser();
    const login = await makeUser();
    const shop = await makeShop({ salesRepId: rep, userId: login });
    expect(await refusal(db.delete(user).where(eq(user.id, rep)))).toMatch(/has history/);
    expect(await refusal(db.delete(user).where(eq(user.id, login)))).toMatch(/has history/);
    const [row] = await db.select({ salesRepId: retailers.salesRepId, userId: retailers.userId }).from(retailers).where(eq(retailers.id, shop));
    expect(row).toEqual({ salesRepId: rep, userId: login });
  });
});
