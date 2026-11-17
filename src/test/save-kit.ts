/**
 * Test-only helpers for the `actions.db.test.ts` files: they run the app's real save actions
 * against the test database (TEST_DATABASE_URL). Only two things are swapped in those tests:
 * who is signed in (`signIn`) and which database the app talks to (`testDb`).
 */
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { brands, cementTypes, grades, ledgerEntries, products, retailers, stockMovements, user, walletMovements } from "@/db/schema";
import { hasAnyRole, type Role } from "@/lib/roles";

// Test-only DB url, read straight from the environment: src/env.ts would ask for the app's own variables.
export const url = process.env.TEST_DATABASE_URL;

let client: postgres.Sql | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;

/** One small pool for the whole test file (the app's `@/db` is swapped for this). */
export function testDb() {
  if (!database) {
    client = postgres(url ?? "postgres://missing", { max: 5, onnotice: () => {} });
    database = drizzle({ client, schema });
  }
  return database;
}

export async function closeTestDb() {
  await client?.end();
  client = undefined;
  database = undefined;
}

type Person = { id: string; role: string; name: string };
let current: Person | null = null;

/** The person the next action runs as. */
export function signIn(person: Person) {
  current = person;
}

/** Stands in for src/lib/session.ts: same role rule, a thrown error where the app would redirect. */
export const sessionMock = {
  getSession: async () => (current ? { user: current, session: { id: "test" } } : null),
  requireUser: async () => {
    if (!current) throw new Error("redirect:/sign-in");
    return { user: current, session: { id: "test" } };
  },
  requireAdmin: async () => {
    if (!current || !hasAnyRole(current.role, [])) throw new Error("redirect:/dashboard");
    return { user: current, session: { id: "test" } };
  },
  requireRole: async (...roles: Role[]) => {
    if (!current) throw new Error("redirect:/sign-in");
    if (!hasAnyRole(current.role, roles)) throw new Error("redirect:/dashboard");
    return { user: current, session: { id: "test" } };
  },
};

const suffix = () => randomBytes(5).toString("hex");
export const formId = () => randomUUID();

export async function makePerson(role: string): Promise<Person> {
  const id = `save-${suffix()}`;
  const name = `${role} ${id}`;
  await testDb().insert(user).values({ id, name, email: `${id}@save.test`, role, emailVerified: true });
  return { id, role, name };
}

export async function makeShop(over: Partial<typeof retailers.$inferInsert> = {}) {
  const phone = `7${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
  const [row] = await testDb().insert(retailers).values({ name: `Save shop ${suffix()}`, phone, ...over }).returning({ id: retailers.id });
  return row.id;
}

/** A fresh brand with one product (first cement type and grade the migrations made). */
export async function makeProduct() {
  const db = testDb();
  const [grade] = await db
    .select({ id: grades.id, typeId: grades.typeId })
    .from(grades)
    .innerJoin(cementTypes, eq(cementTypes.id, grades.typeId))
    .limit(1);
  if (!grade) throw new Error("The test database has no cement grades (migrations not applied?)");
  const tag = suffix();
  const [brand] = await db.insert(brands).values({ name: `Brand ${tag}` }).returning({ id: brands.id });
  const [product] = await db
    .insert(products)
    .values({ name: `Brand ${tag} Trade`, brandId: brand.id, channel: "trade", gradeId: grade.id })
    .returning({ id: products.id });
  return { productId: product.id, brandId: brand.id, channel: "trade", typeId: grade.typeId, gradeId: grade.id };
}

/** A valid, unused truck number such as BR07QK4821. */
export function truckNumber() {
  const letters = () => String.fromCharCode(65 + randomInt(0, 26)) + String.fromCharCode(65 + randomInt(0, 26));
  return `BR${String(randomInt(1, 99)).padStart(2, "0")}${letters()}${String(randomInt(0, 10_000)).padStart(4, "0")}`;
}

export async function bagsOnTruck(vehicleId: string, productId: string) {
  const [row] = await testDb()
    .select({ bags: sql<number>`coalesce(sum(${stockMovements.bags}), 0)`.mapWith(Number) })
    .from(stockMovements)
    .where(sql`${stockMovements.vehicleId} = ${vehicleId} and ${stockMovements.productId} = ${productId}`);
  return row.bags;
}

export async function duesOf(retailerId: string) {
  const [row] = await testDb()
    .select({ paise: sql<number>`coalesce(sum(${ledgerEntries.amountPaise}), 0)`.mapWith(Number) })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.retailerId, retailerId));
  return row.paise;
}

export async function walletRows(collectorId: string) {
  return testDb().select().from(walletMovements).where(eq(walletMovements.collectorId, collectorId));
}
