/**
 * Reversals against a real database (lib/reversals.ts + the drizzle/0043 guard triggers): full and part
 * returns of a load, purchase reversals, double taps, real concurrent reversals, a raw insert that skips
 * the app, FIFO aging after a reversal, and the books check on every row this test made.
 *
 * Needs a real, already-migrated Postgres, so it runs only when TEST_DATABASE_URL is set and is
 * skipped otherwise (CI has no database). Local run:
 *   TEST_DATABASE_URL=postgres://postgres:DUMMYPASS@127.0.0.1:5543/rev pnpm vitest run src/lib/reversals.db.test.ts
 * The book tables are append-only (triggers), so nothing is deleted: every test makes fresh rows.
 */
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import {
  auditLog,
  brands,
  dispatches,
  godowns,
  grades,
  ledgerEntries,
  orders,
  products,
  purchases,
  receipts,
  retailers,
  stockMovements,
  supplierLedgerEntries,
  user,
  vehicles,
} from "@/db/schema";
import { activityLogQuery, QUERIES } from "@/lib/books-check-queries";
import { planDispatch } from "@/lib/dispatch-rules";
import { duesFromLedger } from "@/lib/due-items";
import { ledgerMomentSql, ledgerReversesAtSql } from "@/lib/ledger-sql";
import { reverseDispatchInTx, reversePurchaseInTx, type ReversalTx } from "@/lib/reversals";
import { ROLES } from "@/lib/roles";

// Test-only DB url, read straight from the environment: src/env.ts would ask for the app's own variables.
const url = process.env.TEST_DATABASE_URL;

// saveOnce (lib/form-submissions.ts) uses the app's `db`: point it at the test database.
vi.mock("@/db", async () => {
  const pg = (await import("postgres")).default;
  const { drizzle: make } = await import("drizzle-orm/postgres-js");
  const s = await import("@/db/schema");
  const client = pg(process.env.TEST_DATABASE_URL ?? "postgres://none@127.0.0.1:1/none", { max: 2, onnotice: () => {} });
  return { db: make({ client, schema: s }), client };
});

const RATE = 300_00;
const COST = 250_00;

describe.skipIf(!url)("reversals (real database)", () => {
  let client: postgres.Sql;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let productId: string;
  let productName: string;
  let brandId: string;
  let vehicleId: string;
  let vehicleNumber: string;
  const started = new Date(Date.now() - 1000);
  const made = { orders: new Set<string>(), shops: new Set<string>() };

  const suffix = () => randomBytes(6).toString("hex");

  async function makeUser(role = "admin") {
    const id = `rev-${suffix()}`;
    await db.insert(user).values({ id, name: `Rev ${id}`, email: `${id}@rev.test`, role });
    return id;
  }
  async function makeShop() {
    const phone = `9${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
    const [row] = await db.insert(retailers).values({ name: `Rev shop ${suffix()}`, phone }).returning({ id: retailers.id });
    made.shops.add(row.id);
    return row.id;
  }
  async function makeGodown(admin: string, bags: number, at?: Date) {
    const [g] = await db.insert(godowns).values({ name: `Rev godown ${suffix()}` }).returning({ id: godowns.id });
    if (bags > 0) {
      const [m] = await db
        .insert(stockMovements)
        .values({ productId, godownId: g.id, type: "opening", bags, actorId: admin, ...(at ? { createdAt: at } : {}) })
        .returning({ id: stockMovements.id });
      await db.insert(auditLog).values({ actorId: admin, entity: "stock", entityId: m.id, action: "opening", details: {} });
    }
    return g.id;
  }
  async function placeOrder(retailerId: string, by: string, bags: number) {
    const [row] = await db
      .insert(orders)
      .values({ retailerId, productId, bags, ratePaise: RATE, status: "approved", placedBy: by, source: "phone" })
      .returning({ id: orders.id });
    made.orders.add(row.id);
    return row.id;
  }

  /** The rows dispatchOrder writes (dispatch/actions.ts), with an optional explicit moment. */
  async function dispatchLoad(orderId: string, bags: number, godownId: string, by: string, at?: Date) {
    return db.transaction(async (tx) => {
      const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("no key update");
      const [sent] = await tx.select({ n: sql<number>`coalesce(sum(${dispatches.bags}), 0)`.mapWith(Number) }).from(dispatches).where(eq(dispatches.orderId, orderId));
      const [stock] = await tx
        .select({ n: sql<number>`coalesce(sum(${stockMovements.bags}), 0)`.mapWith(Number) })
        .from(stockMovements)
        .where(and(eq(stockMovements.productId, productId), eq(stockMovements.godownId, godownId)));
      const plan = planDispatch({ status: o.status, orderedBags: o.bags, alreadyDispatchedBags: sent.n, bags, ratePaise: o.ratePaise, stockBalance: stock.n });
      if (!plan.ok) throw new Error(plan.error);
      const when = at ? { createdAt: at } : {};
      const [d] = await tx
        .insert(dispatches)
        .values({ orderId, bags, vehicleId, driverName: "Test", driverPhone: "9876543210", fromGodownId: godownId, ratePaise: RATE, dispatchedBy: by, ...when })
        .returning({ id: dispatches.id, createdAt: dispatches.createdAt });
      await tx.insert(stockMovements).values({ productId, godownId, type: "dispatch", bags: -bags, orderId, actorId: by, createdAt: d.createdAt });
      await tx.insert(ledgerEntries).values({ retailerId: o.retailerId, kind: "order_debit", amountPaise: bags * RATE, orderId, actorId: by, createdAt: d.createdAt });
      await tx.insert(auditLog).values({ actorId: by, entity: "dispatch", entityId: d.id, action: "create", details: {} });
      await tx.update(orders).set({ status: plan.newStatus }).where(eq(orders.id, orderId));
      return d.id;
    });
  }

  const actorOf = (id: string, role = "admin") => ({ id, role });
  const reverse = (tx: ReversalTx, dispatchId: string, bags: number, godownId: string, admin: string, reasonCode = "returned") =>
    reverseDispatchInTx(tx, { dispatchId, bags, toPlace: { kind: "godown", id: godownId }, reasonCode, note: "", actor: actorOf(admin) });

  const stockAt = async (godownId: string) =>
    (await db.select({ n: sql<number>`coalesce(sum(${stockMovements.bags}), 0)`.mapWith(Number) }).from(stockMovements).where(and(eq(stockMovements.productId, productId), eq(stockMovements.godownId, godownId))))[0].n;
  const balanceOf = async (shop: string) =>
    (await db.select({ n: sql<number>`coalesce(sum(${ledgerEntries.amountPaise}), 0)`.mapWith(Number) }).from(ledgerEntries).where(eq(ledgerEntries.retailerId, shop)))[0].n;
  const statusOf = async (id: string) => (await db.select({ s: orders.status }).from(orders).where(eq(orders.id, id)))[0].s;
  const supplierBalance = async () =>
    (await db.select({ n: sql<number>`coalesce(sum(${supplierLedgerEntries.amountPaise}), 0)`.mapWith(Number) }).from(supplierLedgerEntries).where(eq(supplierLedgerEntries.brandId, brandId)))[0].n;

  beforeAll(async () => {
    client = postgres(url!, { max: 10, onnotice: () => {} });
    db = drizzle({ client, schema });
    // A fresh brand + product, so the books check can tell this test's rows apart.
    const [g] = await db.select({ id: grades.id }).from(grades).limit(1);
    if (!g) throw new Error("The test database needs a grade (migrations seed the catalogue)");
    const [b] = await db.insert(brands).values({ name: `Rev brand ${suffix()}` }).returning({ id: brands.id });
    brandId = b.id;
    productName = `Rev cement ${suffix()}`;
    const [p] = await db.insert(products).values({ name: productName, brandId, channel: "trade", gradeId: g.id }).returning({ id: products.id });
    productId = p.id;
    vehicleNumber = `TS${String(randomInt(0, 1e8)).padStart(8, "0")}`;
    const [v] = await db.insert(vehicles).values({ number: vehicleNumber, driverName: "" }).returning({ id: vehicles.id });
    vehicleId = v.id;
  });

  afterAll(async () => {
    await client?.end();
    const app = (await import("@/db")) as unknown as { client?: postgres.Sql };
    await app.client?.end();
  });

  it("full reversal: stock and balance back, order approved again, and it can be sent again", async () => {
    const admin = await makeUser();
    const shop = await makeShop();
    const godown = await makeGodown(admin, 500);
    const order = await placeOrder(shop, admin, 100);
    const load = await dispatchLoad(order, 100, godown, admin);
    expect(await statusOf(order)).toBe("dispatched");
    expect(await stockAt(godown)).toBe(400);
    expect(await balanceOf(shop)).toBe(100 * RATE);

    const res = await db.transaction((tx) => reverse(tx, load, 100, godown, admin, "entry_mistake"));
    expect(res.ok).toBe(true);
    expect(await stockAt(godown)).toBe(500);
    expect(await balanceOf(shop)).toBe(0);
    expect(await statusOf(order)).toBe("approved");
    if (!res.ok) return;
    const [row] = await db.select().from(dispatches).where(eq(dispatches.id, res.reversalId));
    expect(row).toMatchObject({ bags: -100, reversesDispatchId: load, reasonCode: "entry_mistake", ratePaise: RATE, fromGodownId: godown, vehicleId });
    const [audit] = await db.select().from(auditLog).where(and(eq(auditLog.entity, "dispatch"), eq(auditLog.entityId, res.reversalId)));
    expect(audit).toMatchObject({ action: "reverse", actorId: admin });

    await dispatchLoad(order, 100, godown, admin);
    expect(await statusOf(order)).toBe("dispatched");
    expect(await balanceOf(shop)).toBe(100 * RATE);
  });

  it("part returns: 30, 20, then 51 refused, 50 accepted, then nothing more; exact at each step", async () => {
    const admin = await makeUser();
    const shop = await makeShop();
    const godown = await makeGodown(admin, 100);
    const back = await makeGodown(admin, 0);
    const order = await placeOrder(shop, admin, 100);
    const load = await dispatchLoad(order, 100, godown, admin);
    const steps: [number, boolean, string | null][] = [
      [30, true, "partly_dispatched"],
      [20, true, "partly_dispatched"],
      [51, false, null],
      [50, true, "approved"],
      [1, false, null],
    ];
    let returned = 0;
    for (const [bags, ok, status] of steps) {
      const res = await db.transaction((tx) => reverse(tx, load, bags, back, admin));
      expect(res.ok).toBe(ok);
      if (ok) returned += bags;
      else expect(res).toEqual({ ok: false, error: returned === 100 ? "This load is already fully reversed." : `Only ${100 - returned} bags of this load are left to reverse.` });
      expect(await stockAt(back)).toBe(returned);
      expect(await stockAt(godown)).toBe(0);
      expect(await balanceOf(shop)).toBe((100 - returned) * RATE);
      if (status) expect(await statusOf(order)).toBe(status);
    }
  });

  it("refuses every non-admin in the core, a missing reason, and a reversal of a reversal", async () => {
    const admin = await makeUser();
    const shop = await makeShop();
    const godown = await makeGodown(admin, 50);
    const order = await placeOrder(shop, admin, 50);
    const load = await dispatchLoad(order, 50, godown, admin);
    for (const role of [...ROLES.filter((r) => r !== "admin"), null]) {
      const res = await db.transaction((tx) =>
        reverseDispatchInTx(tx, { dispatchId: load, bags: 1, toPlace: { kind: "godown", id: godown }, reasonCode: "returned", note: "", actor: { id: admin, role } }),
      );
      expect(res).toEqual({ ok: false, error: "Only an admin can reverse a dispatch." });
    }
    expect(await db.transaction((tx) => reverse(tx, load, 5, godown, admin, ""))).toEqual({ ok: false, error: "Pick a reason" });
    const first = await db.transaction((tx) => reverse(tx, load, 5, godown, admin));
    if (!first.ok) throw new Error(first.error);
    expect(await db.transaction((tx) => reverse(tx, first.reversalId, 1, godown, admin))).toEqual({ ok: false, error: "This row is already a reversal." });
    expect(await balanceOf(shop)).toBe(45 * RATE);
  });

  it("double taps save once, concurrent full reversals let exactly one through, and a raw insert over the limit is refused", async () => {
    const admin = await makeUser();
    const shop = await makeShop();
    const godown = await makeGodown(admin, 300);
    const order = await placeOrder(shop, admin, 300);
    const { saveOnce } = await import("@/lib/form-submissions");

    // Same form id twice: the second answer replays the first and writes nothing.
    const loadA = await dispatchLoad(order, 100, godown, admin);
    const requestId = randomUUID();
    const run = () =>
      saveOnce({ id: requestId, kind: "dispatch_reversal", actorId: admin }, async (tx) => {
        const r = await reverse(tx, loadA, 100, godown, admin);
        return r.ok ? { ok: true, resultId: r.reversalId } : r;
      });
    const one = await run();
    const two = await run();
    expect(one).toMatchObject({ ok: true, replay: false });
    expect(two).toMatchObject({ ok: true, replay: true });
    expect(await db.select().from(dispatches).where(eq(dispatches.reversesDispatchId, loadA))).toHaveLength(1);

    // Two different reversals of the whole load at the same moment, on two connections.
    for (let round = 0; round < 3; round++) {
      const load = await dispatchLoad(order, 50, godown, admin);
      const results = await Promise.all([1, 2, 3].map(() => db.transaction((tx) => reverse(tx, load, 50, godown, admin))));
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      const [sum] = await db.select({ n: sql<number>`coalesce(sum(-${dispatches.bags}), 0)`.mapWith(Number) }).from(dispatches).where(eq(dispatches.reversesDispatchId, load));
      expect(sum.n).toBe(50);
    }

    // Skipping the app: the trigger refuses reversing more than the load, and a reversal of the wrong order or rate.
    const loadB = await dispatchLoad(order, 40, godown, admin);
    const raw = (bags: number, over: Partial<typeof dispatches.$inferInsert> = {}) =>
      db.insert(dispatches).values({
        orderId: order,
        bags: -bags,
        vehicleId,
        driverName: "Test",
        driverPhone: "9876543210",
        fromGodownId: godown,
        ratePaise: RATE,
        dispatchedBy: admin,
        reversesDispatchId: loadB,
        reasonCode: "returned",
        ...over,
      });
    await expect(raw(41)).rejects.toThrow();
    await expect(raw(5, { ratePaise: RATE + 1 })).rejects.toThrow();
    await expect(raw(5, { reasonCode: null })).rejects.toThrow();
    const other = await placeOrder(shop, admin, 10);
    await expect(raw(5, { orderId: other })).rejects.toThrow();
    await expect(raw(5, { reversesDispatchId: (await db.select().from(dispatches).where(eq(dispatches.reversesDispatchId, loadA)))[0].id })).rejects.toThrow();
    // Within the limit it passes the trigger (the books check below then wants its stock and ledger rows,
    // so this one is done through the app instead).
    const ok = await db.transaction((tx) => reverse(tx, loadB, 40, godown, admin));
    expect(ok.ok).toBe(true);
    await expect(raw(1)).rejects.toThrow();
  });

  it("purchase reversal: supplier and stock exact, limits by received bags and by stock, concurrent reversals", async () => {
    const admin = await makeUser();
    const godown = await makeGodown(admin, 0);
    const before = await supplierBalance();

    /** The rows recordPurchase writes (stock/actions.ts): movement, short adjustment, supplier entry, header, log. */
    async function purchase(billed: number, short: number, header = true) {
      return db.transaction(async (tx) => {
        const [m] = await tx
          .insert(stockMovements)
          .values({ productId, godownId: godown, type: "purchase", bags: billed, unitCostPaise: COST, actorId: admin })
          .returning({ id: stockMovements.id });
        await tx.insert(auditLog).values({ actorId: admin, entity: "stock", entityId: m.id, action: "purchase", details: {} });
        let shortId: string | null = null;
        if (short > 0) {
          const [s] = await tx
            .insert(stockMovements)
            .values({ productId, godownId: godown, type: "adjustment", bags: -short, reasonCode: "transit_short", reason: "Short", actorId: admin, createdAt: sql`now() + interval '1 millisecond'` })
            .returning({ id: stockMovements.id });
          shortId = s.id;
          await tx.insert(auditLog).values({ actorId: admin, entity: "stock", entityId: s.id, action: "adjustment", details: {} });
        }
        const day = (await tx.execute(sql`select (timezone('Asia/Kolkata', now()))::date::text d`)) as unknown as { d: string }[];
        await tx.insert(supplierLedgerEntries).values({ brandId, kind: "purchase", amountPaise: billed * COST, entryDate: day[0].d, stockMovementId: m.id, reference: "INV-1", actorId: admin });
        if (header) {
          await tx.insert(purchases).values({
            stockMovementId: m.id,
            invoiceNo: "INV-1",
            invoiceDate: day[0].d,
            truckNumber: vehicleNumber,
            driverName: "Test",
            driverPhone: "9876543210",
            billedBags: billed,
            shortBags: short,
            receivedBags: billed - short,
            landedUnitCostPaise: COST,
            shortMovementId: shortId,
            claimStatus: short > 0 ? "open" : "none",
            actorId: admin,
          });
        }
        return m.id;
      });
    }
    const undo = (tx: ReversalTx, movementId: string, bags: number, role: string | null = "admin") =>
      reversePurchaseInTx(tx, { movementId, bags, reasonCode: "entry_mistake", note: "", actor: { id: admin, role } });

    const p = await purchase(200, 10);
    expect(await stockAt(godown)).toBe(190);
    expect(await supplierBalance()).toBe(before + 200 * COST);
    expect(await db.transaction((tx) => undo(tx, p, 5, "logistics"))).toEqual({ ok: false, error: "Only an admin can reverse a purchase." });

    const r = await db.transaction((tx) => undo(tx, p, 50));
    expect(r.ok).toBe(true);
    expect(await stockAt(godown)).toBe(140);
    expect(await supplierBalance()).toBe(before + 150 * COST);
    if (r.ok) {
      const [entry] = await db.select().from(supplierLedgerEntries).where(eq(supplierLedgerEntries.stockMovementId, r.movementId));
      expect(entry).toMatchObject({ kind: "purchase_reversal", amountPaise: -50 * COST, reference: "INV-1", brandId });
    }
    expect(await db.transaction((tx) => undo(tx, p, 141))).toEqual({ ok: false, error: "Only 140 bags of this purchase are left to reverse." });
    // Fewer bags at the place than are left to reverse.
    const [adj] = await db
      .insert(stockMovements)
      .values({ productId, godownId: godown, type: "adjustment", bags: -100, reasonCode: "damage", reason: "Damaged", actorId: admin })
      .returning({ id: stockMovements.id });
    await db.insert(auditLog).values({ actorId: admin, entity: "stock", entityId: adj.id, action: "adjustment", details: {} });
    const res = await db.transaction((tx) => undo(tx, p, 60));
    expect(res).toMatchObject({ ok: false });
    expect(res.ok ? "" : res.error).toMatch(/^Only 40 bags are at Rev godown/);

    // A purchase without a header: max = its bags. Three full reversals at once: one wins.
    const q = await purchase(30, 0, false);
    const all = await Promise.all([1, 2, 3].map(() => db.transaction((tx) => undo(tx, q, 30))));
    expect(all.filter((x) => x.ok)).toHaveLength(1);
    // Skipping the app: the trigger refuses going over.
    await expect(
      db.insert(stockMovements).values({ productId, godownId: godown, type: "purchase_reversal", bags: -1, unitCostPaise: COST, reversesMovementId: q, reasonCode: "returned", actorId: admin }),
    ).rejects.toThrow();
    await expect(
      db.insert(stockMovements).values({ productId, godownId: godown, type: "purchase_reversal", bags: -1, unitCostPaise: COST + 1, reversesMovementId: p, reasonCode: "returned", actorId: admin }),
    ).rejects.toThrow();
    expect(await supplierBalance()).toBe(before + 150 * COST);
  });

  it("aging: reversing a newer load leaves the old item's age and amount as they were", async () => {
    const admin = await makeUser();
    const shop = await makeShop();
    const godown = await makeGodown(admin, 300, new Date(Date.now() - 60 * 86_400_000));
    const oldOrder = await placeOrder(shop, admin, 100);
    await dispatchLoad(oldOrder, 100, godown, admin, new Date(Date.now() - 50 * 86_400_000));
    await db.insert(ledgerEntries).values({ retailerId: shop, kind: "receipt_credit", amountPaise: -10_000_00, actorId: admin, createdAt: new Date(Date.now() - 40 * 86_400_000) });
    const newOrder = await placeOrder(shop, admin, 100);
    const newLoad = await dispatchLoad(newOrder, 100, godown, admin);
    const res = await db.transaction((tx) => reverse(tx, newLoad, 100, godown, admin));
    expect(res.ok).toBe(true);

    // Read the ledger the way the aging readers do (overdue.ts, reports.ts, credit-check-queries.ts).
    const rows = await db
      .select({ id: ledgerEntries.id, kind: ledgerEntries.kind, amountPaise: ledgerEntries.amountPaise, orderId: ledgerEntries.orderId, createdAt: ledgerMomentSql, reversesAt: ledgerReversesAtSql })
      .from(ledgerEntries)
      .leftJoin(receipts, eq(receipts.id, ledgerEntries.receiptId))
      .where(eq(ledgerEntries.retailerId, shop))
      .orderBy(asc(ledgerMomentSql), asc(ledgerEntries.id));
    const reversal = rows.find((r) => r.kind === "dispatch_reversal");
    const newDebit = rows.find((r) => r.kind === "order_debit" && r.orderId === newOrder);
    expect(reversal?.reversesAt?.getTime()).toBe(newDebit?.createdAt.getTime());
    const without = rows.filter((r) => r !== reversal && r !== newDebit);
    const a = duesFromLedger(rows);
    expect(a.items).toEqual(duesFromLedger(without).items);
    expect(a.items).toHaveLength(1);
    expect(a.items[0]).toMatchObject({ orderId: oldOrder, duePaise: 100 * RATE - 10_000_00 });
  });

  it("books check: none of the 11 checks flags a row this test made", async () => {
    const checks: [string, SQL][] = [...Object.entries(QUERIES), ["I12", activityLogQuery(started)]];
    const refs = new Set<string>([...made.orders, ...made.shops, brandId]);
    for (const [id, query] of checks) {
      const rows = (await db.execute(query)) as unknown as { ref: string | null; what: string | null }[];
      const ours = rows.filter((r) => (r.ref !== null && refs.has(r.ref)) || (r.what ?? "").includes(productName));
      expect({ id, ours }).toEqual({ id, ours: [] });
    }
  });
});
