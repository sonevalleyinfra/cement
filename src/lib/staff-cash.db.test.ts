/**
 * Race test: a cash payment saved at the same moment as a deactivation must never end with a
 * switched-off person holding cash unnoticed (lib/staff-cash.ts).
 *
 * Needs a real, already-migrated Postgres, so it runs only when TEST_DATABASE_URL is set and is
 * skipped otherwise (CI has no database). Local run:
 *   TEST_DATABASE_URL=postgres://postgres:DUMMYPASS@127.0.0.1:5499/race pnpm vitest run src/lib/staff-cash.db.test.ts
 * The book tables are append-only (triggers), so nothing is deleted: every test makes fresh people
 * and shops with random ids and phones.
 */
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { auditLog, ledgerEntries, receipts, retailers, session, user, walletMovements } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { QUERIES } from "@/lib/books-check-queries";
import { deactivateStaff, deleteStaff, heldCashOf, lockCashRecorder, type StaffTx } from "@/lib/staff-cash";

// Test-only DB url, read straight from the environment: src/env.ts would ask for the app's own variables.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("staff cash vs deactivation (real database)", () => {
  let client: postgres.Sql;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let adminId: string;

  const suffix = () => randomBytes(6).toString("hex");

  async function makeUser(over: Partial<typeof user.$inferInsert> = {}) {
    const id = `race-${suffix()}`;
    await db.insert(user).values({ id, name: `Race ${id}`, email: `${id}@race.test`, role: "sales", ...over });
    return id;
  }

  async function makeShop(over: Partial<typeof retailers.$inferInsert> = {}) {
    const phone = `9${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
    const [row] = await db
      .insert(retailers)
      .values({ name: `Race shop ${suffix()}`, phone, ...over })
      .returning({ id: retailers.id });
    return row.id;
  }

  /** Same lock as receipts/actions.ts lockRetailer (lock order: retailer, then staff). */
  async function lockShop(tx: StaffTx, retailerId: string) {
    await tx.select({ id: retailers.id }).from(retailers).where(eq(retailers.id, retailerId)).for("no key update");
  }

  /** The rows saveReceipt writes for a cash payment: receipt, ledger credit, activity row, wallet row. */
  async function collect(tx: StaffTx, collectorId: string, retailerId: string, amountPaise: number) {
    const [receipt] = await tx
      .insert(receipts)
      .values({ retailerId, mode: "cash", totalPaise: amountPaise, status: "received", receivedBy: collectorId })
      .returning({ id: receipts.id, receiptNo: receipts.receiptNo });
    await tx.insert(ledgerEntries).values({
      retailerId,
      kind: "receipt_credit",
      amountPaise: -amountPaise,
      receiptId: receipt.id,
      note: `Payment #${receipt.receiptNo}`,
      actorId: collectorId,
    });
    await writeAudit(tx, {
      actorId: collectorId,
      entity: "payment",
      entityId: receipt.id,
      action: "record",
      details: { receiptNo: receipt.receiptNo, retailerId, mode: "cash", amountPaise },
    });
    await tx.insert(walletMovements).values({
      collectorId,
      kind: "collected",
      amountPaise,
      receiptId: receipt.id,
      actorId: collectorId,
    });
  }

  /** One payment as saveReceipt does it: lock the shop, then the recorder, then write (or be refused). */
  function savePayment(collectorId: string, retailerId: string, amountPaise: number) {
    return db.transaction(async (tx) => {
      await lockShop(tx, retailerId);
      const check = await lockCashRecorder(tx, collectorId, "recordReceipt");
      if (!check.ok) return check;
      await collect(tx, collectorId, retailerId, amountPaise);
      return { ok: true as const };
    });
  }

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

  async function personOf(id: string) {
    const [row] = await db.select({ banned: user.banned, deletedAt: user.deletedAt }).from(user).where(eq(user.id, id));
    return row;
  }

  const walletRows = (id: string) => db.select().from(walletMovements).where(eq(walletMovements.collectorId, id));

  beforeAll(async () => {
    client = postgres(url!, { max: 8 });
    db = drizzle({ client, schema });
    adminId = await makeUser({ role: "admin" });
  });

  afterAll(async () => {
    await client?.end();
  });

  it("A: a payment that locks first is counted: the deactivation waits, then says hand over", async () => {
    const rep = await makeUser();
    const shop = await makeShop();
    const aLocked = gate();
    const aGo = gate();
    const a = db.transaction(async (tx) => {
      await lockShop(tx, shop);
      expect(await lockCashRecorder(tx, rep, "recordReceipt")).toEqual({ ok: true });
      aLocked.open();
      await aGo.done;
      await collect(tx, rep, shop, 50_000);
    });
    await aLocked.done;
    const b = db.transaction((tx) => deactivateStaff(tx, { actorId: adminId, userId: rep }));
    await waitForLockWait();
    aGo.open();
    await a;
    expect(await b).toEqual({ ok: false, error: "Ask them to hand over ₹500 first." });
    expect((await personOf(rep)).banned).toBe(false);
    expect(await heldCashOf(db, rep)).toBe(50_000);
  });

  it("B: a deactivation that locks first wins: the payment waits, then is refused", async () => {
    const rep = await makeUser();
    const shop = await makeShop();
    const expiresAt = new Date(Date.now() + 86_400_000);
    await db.insert(session).values([
      { id: randomUUID(), token: randomUUID(), userId: rep, expiresAt, updatedAt: new Date() },
      { id: randomUUID(), token: randomUUID(), userId: rep, expiresAt, updatedAt: new Date() },
    ]);
    const bDone = gate();
    const bGo = gate();
    const b = db.transaction(async (tx) => {
      const res = await deactivateStaff(tx, { actorId: adminId, userId: rep });
      bDone.open();
      await bGo.done;
      return res;
    });
    await bDone.done;
    const a = savePayment(rep, shop, 70_000);
    await waitForLockWait();
    bGo.open();
    expect(await b).toEqual({ ok: true });
    expect(await a).toEqual({ ok: false, error: "Your account is switched off." });
    expect(await walletRows(rep)).toHaveLength(0);
    expect((await personOf(rep)).banned).toBe(true);
    expect(await db.select().from(session).where(eq(session.userId, rep))).toHaveLength(0);
    const audit = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entity, "user"), eq(auditLog.entityId, rep), eq(auditLog.action, "deactivate")));
    expect(audit).toHaveLength(1);
  });

  it("C: many payments racing one deactivation never leave cash on a switched-off person", { timeout: 60_000 }, async () => {
    for (let round = 0; round < 12; round++) {
      const rep = await makeUser();
      const shop = await makeShop();
      const amounts = [10_000, 20_000, 30_000, 40_000, 50_000];
      const deactivate = db.transaction((tx) => deactivateStaff(tx, { actorId: adminId, userId: rep }));
      const payments = amounts.map((amount) => savePayment(rep, shop, amount));
      // Put the deactivation at a different place in the queue each round.
      const [off, ...paid] = await Promise.all([deactivate, ...payments]);
      const saved = amounts.filter((_, i) => paid[i].ok).reduce((n, a) => n + a, 0);
      const held = await heldCashOf(db, rep);
      const { banned } = await personOf(rep);
      expect(banned).toBe(off.ok);
      if (banned) expect(held).toBe(0);
      else expect(held).toBe(saved);
    }
  });

  it("D: a switched-off person with cash (old data) shows up in books check I9", async () => {
    const rep = await makeUser({ banned: true, banReason: "Deactivated by admin" });
    await db.insert(walletMovements).values({ collectorId: rep, kind: "collected", amountPaise: 12_345, actorId: rep });
    const gone = await makeUser({ banned: true, deletedAt: new Date() });
    await db.insert(walletMovements).values({ collectorId: gone, kind: "collected", amountPaise: 500, actorId: gone });
    const rows = (await db.execute(
      sql`select * from (${QUERIES.I9}) x where x.ref in (${rep}, ${gone}) order by x.got`,
    )) as unknown as { ref: string; what: string; unit: string; got: string | number }[];
    expect(rows.map((r) => [r.ref, r.what, r.unit, Number(r.got)])).toEqual([
      [gone, `Race ${gone} · cash with switched-off person`, "paise", 500],
      [rep, `Race ${rep} · cash with switched-off person`, "paise", 12_345],
    ]);
    // Someone switched on with cash, or switched off with none, is fine.
    const on = await makeUser();
    await db.insert(walletMovements).values({ collectorId: on, kind: "collected", amountPaise: 900, actorId: on });
    const clean = await makeUser({ banned: true });
    const none = (await db.execute(sql`select * from (${QUERIES.I9}) x where x.ref in (${on}, ${clean})`)) as unknown as unknown[];
    expect(none).toHaveLength(0);
  });

  it("deleteStaff refuses someone still switched on, or holding cash", async () => {
    const active = await makeUser();
    expect(await db.transaction((tx) => deleteStaff(tx, { actorId: adminId, userId: active, isSelf: false }))).toEqual({
      ok: false,
      error: "Deactivate first",
    });
    const holding = await makeUser({ banned: true });
    await db.insert(walletMovements).values({ collectorId: holding, kind: "collected", amountPaise: 20_000, actorId: holding });
    expect(await db.transaction((tx) => deleteStaff(tx, { actorId: adminId, userId: holding, isSelf: false }))).toEqual({
      ok: false,
      error: "Ask them to hand over ₹200 first.",
    });
    expect((await personOf(holding)).deletedAt).toBeNull();
    const clean = await makeUser({ banned: true });
    expect(await db.transaction((tx) => deleteStaff(tx, { actorId: adminId, userId: clean, isSelf: false }))).toEqual({ ok: true });
    expect((await personOf(clean)).deletedAt).not.toBeNull();
  });

  it("deactivating refuses a sales person whose switched-off shop still owes", async () => {
    const rep = await makeUser();
    const shop = await makeShop({ salesRepId: rep, active: false });
    await db.insert(ledgerEntries).values({ retailerId: shop, kind: "opening", amountPaise: 1_00_000, actorId: adminId });
    expect(await db.transaction((tx) => deactivateStaff(tx, { actorId: adminId, userId: rep }))).toEqual({
      ok: false,
      error: "They look after 1 shop. Give it another sales person first.",
    });
    // A switched-off shop that owes nothing is no reason to wait.
    const other = await makeUser();
    await makeShop({ salesRepId: other, active: false });
    expect(await db.transaction((tx) => deactivateStaff(tx, { actorId: adminId, userId: other }))).toEqual({ ok: true });
  });

  it("a person whose staff roles were taken away cannot ask for a handover", async () => {
    const former = await makeUser({ role: "retailer" });
    expect(await db.transaction((tx) => lockCashRecorder(tx, former, "useWallet"))).toEqual({
      ok: false,
      error: "You cannot do this now.",
    });
  });
});
