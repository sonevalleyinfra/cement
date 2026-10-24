/**
 * The credit check at approval against a real database (lib/order-approval.ts): refused without a
 * reason, saved with one, and two approvals of one shop at the same moment never both slip under the limit.
 *
 * Needs a real, already-migrated Postgres, so it runs only when TEST_DATABASE_URL is set and is
 * skipped otherwise (CI has no database). Local run:
 *   TEST_DATABASE_URL=postgres://postgres:DUMMYPASS@127.0.0.1:5499/race pnpm vitest run src/lib/order-approval.db.test.ts
 * The book tables are append-only (triggers), so nothing is deleted: every test makes fresh people
 * and shops with random ids and phones.
 */
import { randomBytes, randomInt } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { creditOverrides, ledgerEntries, notifications, orderEvents, orders, products, retailers, user } from "@/db/schema";
import { approveOrderInTx, type ApprovalTx, type OverrideInput } from "@/lib/order-approval";

// Test-only DB url, read straight from the environment: src/env.ts would ask for the app's own variables.
const url = process.env.TEST_DATABASE_URL;

const RATE = 300_00;

describe.skipIf(!url)("credit check at approval (real database)", () => {
  let client: postgres.Sql;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let productId: string;

  const suffix = () => randomBytes(6).toString("hex");

  async function makeUser(role = "accounts") {
    const id = `credit-${suffix()}`;
    await db.insert(user).values({ id, name: `Credit ${id}`, email: `${id}@credit.test`, role });
    return id;
  }

  async function makeShop(over: Partial<typeof retailers.$inferInsert> = {}) {
    const phone = `9${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
    const [row] = await db
      .insert(retailers)
      .values({ name: `Credit shop ${suffix()}`, phone, ...over })
      .returning({ id: retailers.id });
    return row.id;
  }

  async function placeOrder(retailerId: string, placedBy: string, bags: number, status = "placed") {
    const [row] = await db
      .insert(orders)
      .values({ retailerId, productId, bags, ratePaise: RATE, status, placedBy, source: "phone" })
      .returning({ id: orders.id });
    return row.id;
  }

  function approve(tx: ApprovalTx, orderId: string, actor: { id: string; role: string }, override: OverrideInput = null) {
    return approveOrderInTx(tx, { orderId, actor, seenRatePaise: RATE, override, now: new Date() });
  }

  const statusOf = async (id: string) => (await db.select({ s: orders.status }).from(orders).where(eq(orders.id, id)))[0].s;
  const eventsOf = (id: string) =>
    db.select().from(orderEvents).where(and(eq(orderEvents.orderId, id), eq(orderEvents.toStatus, "approved")));
  const overridesOf = (id: string) => db.select().from(creditOverrides).where(eq(creditOverrides.orderId, id));

  function gate() {
    let open = () => {};
    const done = new Promise<void>((resolve) => {
      open = resolve;
    });
    return { done, open };
  }

  /** Waits until some statement of this database is waiting on a lock (the other transaction). */
  async function waitForLockWait() {
    for (let i = 0; i < 100; i++) {
      const [row] = (await db.execute(
        sql`select count(*)::int n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`,
      )) as unknown as { n: number }[];
      if (row.n > 0) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("The second transaction never waited for the lock");
  }

  beforeAll(async () => {
    client = postgres(url!, { max: 10, onnotice: () => {} });
    db = drizzle({ client, schema });
    const [p] = await db.select({ id: products.id }).from(products).limit(1);
    if (!p) throw new Error("The test database needs at least one product (migrations seed the catalogue)");
    productId = p.id;
  });

  afterAll(async () => {
    await client?.end();
  });

  it("A: over the limit without a reason is refused, and nothing is written", async () => {
    const acc = await makeUser();
    const shop = await makeShop({ creditLimitPaise: 50_000_00 });
    const order = await placeOrder(shop, acc, 200); // ₹60,000 > ₹50,000
    const res = await db.transaction((tx) => approve(tx, order, { id: acc, role: "accounts" }));
    expect(res).toEqual({ ok: false, error: "Over the limit now. Pick a reason.", needsOverride: true });
    expect(await statusOf(order)).toBe("placed");
    expect(await eventsOf(order)).toHaveLength(0);
    expect(await overridesOf(order)).toHaveLength(0);
    // A bad reason is refused too.
    const bad = await db.transaction((tx) => approve(tx, order, { id: acc, role: "accounts" }, { code: "other", note: " " }));
    expect(bad).toEqual({ ok: false, error: "Add a note", needsOverride: true });
    expect(await statusOf(order)).toBe("placed");
  });

  it("B: with a reason it is approved, the override is saved and admins (not the approver) are told", async () => {
    const acc = await makeUser();
    const adminA = await makeUser("admin");
    const adminB = await makeUser("admin");
    const shop = await makeShop({ creditLimitPaise: 50_000_00 });
    await db.insert(ledgerEntries).values({ retailerId: shop, kind: "opening", amountPaise: 20_000_00, actorId: adminA });
    const order = await placeOrder(shop, acc, 100); // ₹20,000 due + ₹3,000 not sent + ₹30,000 = ₹53,000
    await placeOrder(shop, acc, 10, "approved"); // ₹3,000 not sent
    const res = await db.transaction((tx) =>
      approve(tx, order, { id: adminB, role: "admin" }, { code: "payment_promised", note: "  Pays  Monday " }),
    );
    expect(res).toEqual({ ok: true, override: true });
    expect(await statusOf(order)).toBe("approved");
    const [event] = await eventsOf(order);
    expect(event.reasonCode).toBe("payment_promised");
    expect(event.reason).toBe("Pays Monday");
    const rows = await overridesOf(order);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      retailerId: shop,
      actorId: adminB,
      reasonCode: "payment_promised",
      note: "Pays Monday",
      orderPaise: 30_000_00,
      afterPaise: 53_000_00,
      limitPaise: 50_000_00,
      overLimitPaise: 3_000_00,
      oldestOverdueDays: 0,
      creditDays: 30,
      creditStatus: "ok",
    });
    const told = await db
      .select({ userId: notifications.userId, title: notifications.title, type: notifications.type })
      .from(notifications)
      .where(and(eq(notifications.orderId, order), eq(notifications.type, "credit_override")));
    const ids = told.map((t) => t.userId);
    expect(ids).toContain(adminA);
    expect(ids).not.toContain(adminB);
    expect(told.every((t) => t.title === "Approved over limit")).toBe(true);
  });

  it("C: two approvals of one shop at once: the second waits for the shop's lock, then sees the first", async () => {
    const acc1 = await makeUser();
    const acc2 = await makeUser();
    const shop = await makeShop({ creditLimitPaise: 1_00_000_00 });
    const first = await placeOrder(shop, acc1, 200); // ₹60,000
    const second = await placeOrder(shop, acc1, 200); // ₹60,000: each fits alone, not both
    const aDone = gate();
    const aGo = gate();
    const a = db.transaction(async (tx) => {
      const res = await approve(tx, first, { id: acc1, role: "accounts" });
      aDone.open();
      await aGo.done; // still holding the shop's lock
      return res;
    });
    await aDone.done;
    const b = db.transaction((tx) => approve(tx, second, { id: acc2, role: "accounts" }));
    await waitForLockWait();
    aGo.open();
    expect(await a).toEqual({ ok: true, override: false });
    expect(await b).toEqual({ ok: false, error: "Over the limit now. Pick a reason.", needsOverride: true });
    expect(await statusOf(first)).toBe("approved");
    expect(await statusOf(second)).toBe("placed");
  });

  it("C: many approvals racing never approve more than the limit without a reason", { timeout: 60_000 }, async () => {
    for (let round = 0; round < 5; round++) {
      const acc = await makeUser();
      const limit = 1_00_000_00;
      const shop = await makeShop({ creditLimitPaise: limit });
      const ids = await Promise.all([1, 2, 3, 4, 5].map(() => placeOrder(shop, acc, 100))); // ₹30,000 each
      const results = await Promise.all(ids.map((id) => db.transaction((tx) => approve(tx, id, { id: acc, role: "accounts" }))));
      const approved = ids.filter((_, i) => results[i].ok);
      expect(approved).toHaveLength(3);
      for (const r of results) if (!r.ok) expect(r.needsOverride).toBe(true);
      const rows = await db.select({ bags: orders.bags, rate: orders.ratePaise }).from(orders).where(
        and(eq(orders.retailerId, shop), eq(orders.status, "approved")),
      );
      expect(rows.reduce((n, r) => n + r.bags * (r.rate ?? 0), 0)).toBeLessThanOrEqual(limit);
      expect(await db.select().from(creditOverrides).where(inArray(creditOverrides.orderId, ids))).toHaveLength(0);
    }
  });

  it("D: under the limit approves with no override row, and a sent reason is ignored", async () => {
    const acc = await makeUser();
    const shop = await makeShop({ creditLimitPaise: 1_00_000_00 });
    const order = await placeOrder(shop, acc, 10);
    const res = await db.transaction((tx) => approve(tx, order, { id: acc, role: "accounts" }, { code: "owner_said", note: "x" }));
    expect(res).toEqual({ ok: true, override: false });
    const [event] = await eventsOf(order);
    expect(event.reasonCode).toBeNull();
    expect(event.reason).toBe("");
    expect(await overridesOf(order)).toHaveLength(0);
    // No limit set: approves normally too (amber, not a block).
    const open = await makeShop();
    const big = await placeOrder(open, acc, 5000);
    expect(await db.transaction((tx) => approve(tx, big, { id: acc, role: "accounts" }))).toEqual({ ok: true, override: false });
  });

  it("E: dues older than the credit days need a reason even with no limit", async () => {
    const acc = await makeUser();
    const shop = await makeShop({ creditDays: 15 });
    const oldOrder = await placeOrder(shop, acc, 10, "dispatched");
    await db.insert(ledgerEntries).values({
      retailerId: shop,
      kind: "order_debit",
      amountPaise: 3_000_00,
      orderId: oldOrder,
      actorId: acc,
      createdAt: new Date(Date.now() - 40 * 86_400_000),
    });
    const order = await placeOrder(shop, acc, 10);
    expect(await db.transaction((tx) => approve(tx, order, { id: acc, role: "accounts" }))).toEqual({
      ok: false,
      error: "Dues are overdue. Pick a reason.",
      needsOverride: true,
    });
    const res = await db.transaction((tx) => approve(tx, order, { id: acc, role: "accounts" }, { code: "old_customer", note: "" }));
    expect(res).toEqual({ ok: true, override: true });
    const [row] = await overridesOf(order);
    expect(row.overLimitPaise).toBe(0);
    expect(row.limitPaise).toBeNull();
    expect(row.creditDays).toBe(15);
    expect(row.oldestOverdueDays).toBeGreaterThanOrEqual(24);
  });

  it("a shop on hold needs a reason; the override table refuses edits", async () => {
    const acc = await makeUser();
    const shop = await makeShop({ creditStatus: "hold" });
    const order = await placeOrder(shop, acc, 1);
    expect(await db.transaction((tx) => approve(tx, order, { id: acc, role: "accounts" }))).toMatchObject({
      ok: false,
      error: "Shop is on hold. Pick a reason.",
    });
    await db.transaction((tx) => approve(tx, order, { id: acc, role: "accounts" }, { code: "owner_said", note: "" }));
    await expect(db.update(creditOverrides).set({ note: "x" }).where(eq(creditOverrides.orderId, order))).rejects.toThrow();
  });
});
