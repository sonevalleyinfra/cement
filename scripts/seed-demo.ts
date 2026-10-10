/**
 * Fills a LOCAL database with demo data: one user per role, retailers, trucks,
 * a godown with opening stock, orders in different statuses and a receipt.
 * Run with `pnpm seed:demo` (after `pnpm dev` has created the tables and the admin).
 * Safe to run twice: it skips whatever already exists (orders are added only once).
 * Refuses to run on production or a non-local database (rules in scripts/lib/demo-seed-rules.ts).
 */
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  dispatches,
  ledgerEntries,
  orderEvents,
  orders,
  products,
  receipts,
  retailers,
  godowns,
  stockMovements,
  user,
  vehicles,
  walletMovements,
} from "@/db/schema";
import { env } from "@/env";
import { auth } from "@/lib/auth";
import { postEntry } from "@/lib/ledger";
import { orderDebitPaise } from "@/lib/ledger-rules";
import { DEMO_PASSWORD, DEMO_USERS, demoSeedBlocker } from "./lib/demo-seed-rules";

async function ensureUser(email: string, name: string, role: string): Promise<string> {
  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (existing) return existing.id;
  const created = await auth.api.createUser({
    body: { email, password: DEMO_PASSWORD, name, role: role as "admin", data: { emailVerified: true } },
  });
  return created.user.id;
}

async function main() {
  const blocker = demoSeedBlocker({
    nodeEnv: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL,
    force: process.argv.includes("--force"),
  });
  if (blocker) {
    console.error(`[seed-demo] REFUSED: ${blocker}`);
    process.exit(1);
  }

  const [admin] = await db.select({ id: user.id }).from(user).where(eq(user.email, env.SEED_ADMIN_EMAIL.toLowerCase()));
  if (!admin) throw new Error("Admin not found. Run `pnpm db:seed` (or `pnpm dev`) first.");

  const productRows = await db.select().from(products).orderBy(products.name);
  if (productRows.length < 1) throw new Error("Products missing. Run migrations first.");

  const ids: Record<string, string> = {};
  for (const u of DEMO_USERS) ids[u.role] = await ensureUser(u.email, u.name, u.role);
  console.log("[seed-demo] Users ready.");

  // Shops, trucks and the godown are found again if they already exist.
  const shops = [
    ["Sharma Traders", "Patna"],
    ["Gupta Building Supplies", "Gaya"],
    ["Singh Hardware", "Arrah"],
    ["Kumar Cement Store", "Muzaffarpur"],
    ["Yadav Enterprises", "Bhagalpur"],
    ["Mishra & Sons", "Darbhanga"],
  ];
  const phones = shops.map((_, i) => `900000000${i + 1}`);
  await db
    .insert(retailers)
    .values(
      shops.map(([name, place], i) => ({
        name,
        place,
        phone: phones[i],
        userId: i === 0 ? ids.retailer : null,
        salesRepId: ids.sales,
      })),
    )
    .onConflictDoNothing();
  const found = await db.select().from(retailers).where(inArray(retailers.phone, phones));
  const shopRows = phones.map((phone) => found.find((r) => r.phone === phone)!);

  // Everything below runs once: skipped if the first demo shop already has an order.
  const [already] = await db.select({ id: orders.id }).from(orders).where(eq(orders.retailerId, shopRows[0].id)).limit(1);
  if (already) {
    console.log("[seed-demo] Demo data already there. Nothing more to do.");
    return;
  }

  const trucks = [
    { number: "BR01AB1234", driverName: "Ramesh", driverPhone: "9100000001" },
    { number: "BR02CD5678", driverName: "Suresh", driverPhone: "9100000002" },
  ];
  await db.insert(vehicles).values(trucks).onConflictDoNothing();
  const vehicleRows = await db.select().from(vehicles).where(inArray(vehicles.number, trucks.map((t) => t.number)));
  const truck = { ...vehicleRows.find((v) => v.number === trucks[0].number)!, ...trucks[0] };

  // One godown with opening stock (500 bags of each product).
  let [godown] = await db
    .select({ id: godowns.id })
    .from(godowns)
    .where(sql`lower(${godowns.name}) = 'main godown'`);
  if (!godown) [godown] = await db.insert(godowns).values({ name: "Main Godown" }).returning({ id: godowns.id });
  await db.insert(stockMovements).values(
    productRows.map((p) => ({
      productId: p.id,
      godownId: godown.id,
      type: "opening",
      bags: 500,
      reason: "Demo opening stock",
      actorId: admin.id,
    })),
  );

  const prod = productRows[0];
  const RATE = 35000; // Rs 350 a bag, in paise

  // [shop, bags, final status, bags already dispatched]
  const plan = [
    [0, 100, "placed", 0],
    [1, 80, "rate_filled", 0],
    [2, 60, "assigned", 0],
    [3, 100, "partly_dispatched", 40],
    [4, 50, "dispatched", 50],
    [5, 30, "cancelled", 0],
  ] as const;

  const orderIds: string[] = [];
  for (const [shopIdx, bags, status, sentBags] of plan) {
    await db.transaction(async (tx) => {
      const shop = shopRows[shopIdx];
      const priced = status !== "placed";
      const [o] = await tx
        .insert(orders)
        .values({
          retailerId: shop.id,
          productId: prod.id,
          bags,
          ratePaise: priced ? RATE : null,
          status,
          placedBy: ids.sales,
          salesRepId: ids.sales,
        })
        .returning();
      orderIds.push(o.id);
      const trail = ["placed", "rate_filled", "approved", "assigned", "partly_dispatched", "dispatched", "cancelled"];
      const stop = status === "cancelled" ? "approved" : status;
      const path = trail.slice(0, trail.indexOf(stop) + 1).filter((s) => s !== "partly_dispatched" || stop === s);
      let from: string | null = null;
      let step = 0;
      // One second apart, so the history shows in the right order.
      for (const to of status === "cancelled" ? [...path, "cancelled"] : path) {
        await tx.insert(orderEvents).values({
          orderId: o.id,
          fromStatus: from,
          toStatus: to,
          actorId: ids.sales,
          createdAt: new Date(Date.now() - 60_000 + step++ * 1000),
        });
        from = to;
      }
      const approved = ["assigned", "partly_dispatched", "dispatched", "cancelled"].includes(status);
      if (approved) {
        const amount = orderDebitPaise(bags, RATE) as number;
        await postEntry(
          tx,
          { retailerId: shop.id, kind: "order_debit", amountPaise: amount, orderId: o.id },
          ids.accounts,
          "Order approved",
        );
        if (status === "cancelled") {
          await postEntry(
            tx,
            { retailerId: shop.id, kind: "adjustment", amountPaise: -amount, orderId: o.id },
            ids.accounts,
            "Order cancelled",
          );
        }
      }
      if (sentBags > 0) {
        await tx.insert(dispatches).values({
          orderId: o.id,
          bags: sentBags,
          vehicleId: truck.id,
          driverName: truck.driverName,
          driverPhone: truck.driverPhone,
          fromGodownId: godown.id,
          dispatchedBy: ids.logistics,
        });
        await tx.insert(stockMovements).values({
          productId: prod.id,
          godownId: godown.id,
          type: "dispatch",
          bags: -sentBags,
          orderId: o.id,
          actorId: ids.logistics,
        });
      }
    });
  }

  // A cash receipt of Rs 10,000 from Kumar Cement Store, paid against its partly dispatched order.
  const paid = 1_000_000;
  await db.transaction(async (tx) => {
    const shop = shopRows[3];
    const [r] = await tx
      .insert(receipts)
      .values({ retailerId: shop.id, mode: "cash", totalPaise: paid, status: "received", receivedBy: ids.accounts })
      .returning({ id: receipts.id, receiptNo: receipts.receiptNo });
    await postEntry(
      tx,
      { retailerId: shop.id, kind: "receipt_credit", amountPaise: -paid },
      ids.accounts,
      `Receipt #${r.receiptNo}`,
      r.id,
    );
    await tx.insert(walletMovements).values({
      collectorId: ids.accounts,
      kind: "collected",
      amountPaise: paid,
      receiptId: r.id,
      actorId: ids.accounts,
    });
  });

  const n = await db.select({ id: ledgerEntries.id }).from(ledgerEntries);
  console.log(`[seed-demo] Done: ${shopRows.length} retailers, ${orderIds.length} orders, ${n.length} ledger rows.`);
  console.log(`[seed-demo] Sign in as sales@/accounts@/logistics@/retailer@demo.test with the demo password in docs/GUIDE.md.`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error("[seed-demo] FAILED:", error instanceof Error ? error.message : error);
    if (error instanceof Error && error.cause) console.error("[seed-demo] Cause:", error.cause);
    process.exit(1);
  });
