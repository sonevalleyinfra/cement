/**
 * Fills a LOCAL database with demo data: one user per role, retailers, trucks,
 * a godown with opening stock, orders in different statuses (dues come from their dispatches)
 * and a receipt.
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
import { dispatchEntry } from "@/lib/ledger-rules";
import { statusAfterDispatch, type OrderStatus } from "@/lib/order-rules";
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

  // [shop, bags, final status, loads dispatched]. Shop 0 is the retailer login's shop: its order
  // was placed by the retailer and waits for the sales person to fill the rate.
  const plan: [number, number, OrderStatus, number[]][] = [
    [0, 100, "placed", []],
    [1, 80, "placed", []],
    [2, 60, "approved", []],
    [3, 100, "partly_dispatched", [40]],
    [4, 50, "dispatched", [30, 20]],
    [5, 30, "cancelled", []],
  ];

  const orderIds: string[] = [];
  for (const [shopIdx, bags, status, loads] of plan) {
    await db.transaction(async (tx) => {
      const shop = shopRows[shopIdx];
      const byRetailer = shopIdx === 0;
      const [o] = await tx
        .insert(orders)
        .values({
          retailerId: shop.id,
          productId: prod.id,
          bags,
          ratePaise: byRetailer ? null : RATE,
          status,
          placedBy: byRetailer ? ids.retailer : ids.sales,
          salesRepId: ids.sales,
        })
        .returning();
      orderIds.push(o.id);

      // History, one second apart so it shows in the right order.
      let at = Date.now() - 60_000;
      let from: string | null = null;
      const event = async (to: string, actorId: string, reason = "") => {
        await tx.insert(orderEvents).values({
          orderId: o.id,
          fromStatus: from,
          toStatus: to,
          actorId,
          reason,
          createdAt: new Date((at += 1000)),
        });
        from = to;
      };
      await event("placed", byRetailer ? ids.retailer : ids.sales);
      if (status !== "placed") await event("approved", ids.accounts);

      // Each load takes bags out of the godown and bills them: bags x rate (one ledger debit per load).
      let sent = 0;
      for (const load of loads) {
        sent += load;
        await tx.insert(dispatches).values({
          orderId: o.id,
          bags: load,
          vehicleId: truck.id,
          driverName: truck.driverName,
          driverPhone: truck.driverPhone,
          fromGodownId: godown.id,
          ratePaise: RATE,
          dispatchedBy: ids.logistics,
        });
        await tx.insert(stockMovements).values({
          productId: prod.id,
          godownId: godown.id,
          type: "dispatch",
          bags: -load,
          orderId: o.id,
          reason: `Truck ${truck.number}`,
          actorId: ids.logistics,
        });
        const debit = dispatchEntry(o, load, RATE);
        if (!debit.ok) throw new Error(debit.error);
        await postEntry(tx, debit.entry, ids.logistics, `${load} bags in ${truck.number}`);
        await event(statusAfterDispatch(bags, sent), ids.logistics, `${load} bags in ${truck.number}`);
      }
      if (status === "cancelled") await event("cancelled", admin.id, "Shop closed for repairs");
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
