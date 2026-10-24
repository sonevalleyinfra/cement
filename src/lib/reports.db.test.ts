/**
 * Dues aging against a real database: the range end is compared with the ledger moment
 * (`ledgerMomentSql`, a raw sql expression), so the Date must be bound as a timestamptz itself.
 * Passing the Date straight to `lt(ledgerMomentSql, ...)` crashed postgres-js (ERR_INVALID_ARG_TYPE).
 *
 * Needs a real, already-migrated Postgres, so it runs only when TEST_DATABASE_URL is set and is
 * skipped otherwise (CI has no database). Local run:
 *   TEST_DATABASE_URL=postgres://postgres:***@127.0.0.1:5435/t893 pnpm vitest run src/lib/reports.db.test.ts
 * The book tables are append-only, so nothing is deleted: every run makes a fresh shop.
 */
import { randomBytes, randomInt } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { ledgerEntries, receipts, retailers, user } from "@/db/schema";
import { toISTDateKey } from "@/lib/datetime";
import { addDays, rangeOf } from "@/lib/report-range";

// The app's db module reads the app's env; the test passes its own connection instead.
vi.mock("@/db", () => ({ db: {}, schema: {} }));

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("getDuesAging (real database)", () => {
  let client: postgres.Sql;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let shop: string;
  const DAY = 86_400_000;

  beforeAll(async () => {
    client = postgres(url!, { max: 2 });
    db = drizzle({ client, schema });
    const suffix = randomBytes(6).toString("hex");
    const adminId = `aging-${suffix}`;
    await db.insert(user).values({ id: adminId, name: `Aging ${suffix}`, email: `${adminId}@aging.test`, role: "admin" });
    const phone = `9${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
    const [row] = await db
      .insert(retailers)
      .values({ name: `Aging shop ${suffix}`, phone })
      .returning({ id: retailers.id });
    shop = row.id;
    const now = new Date();
    const today = toISTDateKey(now);

    // Owes 100.00 since 40 days back.
    await db.insert(ledgerEntries).values({
      retailerId: shop,
      kind: "opening",
      amountPaise: 10_000,
      actorId: adminId,
      createdAt: new Date(now.getTime() - 40 * DAY),
    });
    // Paid 40.00, typed in today but received 5 days back: counts on the received day.
    const [late] = await db
      .insert(receipts)
      .values({
        retailerId: shop,
        mode: "cash",
        totalPaise: 4_000,
        status: "received",
        receivedBy: adminId,
        receivedOn: addDays(today, -5),
        backdateReasonCode: "late_entry",
      })
      .returning({ id: receipts.id });
    await db.insert(ledgerEntries).values({
      retailerId: shop,
      kind: "receipt_credit",
      amountPaise: -4_000,
      receiptId: late.id,
      actorId: adminId,
    });
    // Paid 10.00 today: counts today.
    const [fresh] = await db
      .insert(receipts)
      .values({ retailerId: shop, mode: "cash", totalPaise: 1_000, status: "received", receivedBy: adminId })
      .returning({ id: receipts.id });
    await db.insert(ledgerEntries).values({
      retailerId: shop,
      kind: "receipt_credit",
      amountPaise: -1_000,
      receiptId: fresh.id,
      actorId: adminId,
    });
  });

  afterAll(async () => {
    await client?.end();
  });

  const lineOf = (aging: Awaited<ReturnType<typeof import("@/lib/reports").getDuesAging>>) =>
    aging.lines.find((l) => l.retailerId === shop);

  it("as of yesterday: counts the backdated payment, not today's", async () => {
    const { getDuesAging } = await import("@/lib/reports");
    const today = toISTDateKey(new Date());
    const yesterday = addDays(today, -1);
    const aging = await getDuesAging(rangeOf(addDays(today, -30), yesterday), db);
    expect(lineOf(aging)?.duePaise).toBe(6_000);
  });

  it("as of today: counts both payments", async () => {
    const { getDuesAging } = await import("@/lib/reports");
    const today = toISTDateKey(new Date());
    const aging = await getDuesAging(rangeOf(addDays(today, -30), today), db);
    expect(lineOf(aging)?.duePaise).toBe(5_000);
  });

  it("before the backdated payment's day: owes the full opening", async () => {
    const { getDuesAging } = await import("@/lib/reports");
    const today = toISTDateKey(new Date());
    const aging = await getDuesAging(rangeOf(addDays(today, -30), addDays(today, -6)), db);
    expect(lineOf(aging)?.duePaise).toBe(10_000);
  });
});
