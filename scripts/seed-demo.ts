/**
 * Fills a LOCAL database with demo data: one user per role, retailers, vehicles,
 * godowns with opening stock, orders in different statuses and a receipt.
 * Run with `pnpm seed:demo` (after `pnpm dev` has created the tables and the admin).
 * Safe to run twice: it skips whatever already exists.
 * Refuses to run on production or a non-local database (rules in scripts/lib/demo-seed-rules.ts).
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  dispatches,
  firms,
  ledgerEntries,
  orderEvents,
  orders,
  products,
  receiptAllocations,
  receipts,
  retailers,
  stockLocations,
  stockMovements,
  user,
  userFirms,
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

  const firmRows = await db.select().from(firms).orderBy(firms.slot);
  const productRows = await db.select().from(products).orderBy(products.name);
  if (firmRows.length < 3 || productRows.length < 1) throw new Error("Firms/products missing. Run migrations first.");

  // Users and firm access (admin sees every firm; the others get all three, the retailer too, so the order screens work).
  const ids: Record<string, string> = {};
  for (const u of DEMO_USERS) {
    ids[u.role] = await ensureUser(u.email, u.name, u.role);
    if (u.role !== "admin") {
      await db
        .insert(userFirms)
        .values(firmRows.map((f) => ({ userId: ids[u.role], firmId: f.id })))
        .onConflictDoNothing();
    }
  }
  console.log("[seed-demo] Users ready.");

  // Everything below runs once: skipped if the first demo retailer exists.
  const [already] = await db.select({ id: retailers.id }).from(retailers).where(eq(retailers.phone, "9000000001"));
  if (already) {
    console.log("[seed-demo] Demo data already there. Nothing more to do.");
    return;
  }

  const shops = [
    ["Sharma Traders", "Patna"],
    ["Gupta Building Supplies", "Gaya"],
    ["Singh Hardware", "Arrah"],
    ["Kumar Cement Store", "Muzaffarpur"],
    ["Yadav Enterprises", "Bhagalpur"],
    ["Mishra & Sons", "Darbhanga"],
  ];
  const shopRows = await db
    .insert(retailers)
    .values(
      shops.map(([name, place], i) => ({
        name,
        place,
        phone: `900000000${i + 1}`,
        userId: i === 0 ? ids.retailer : null,
        salesRepId: ids.sales,
      })),
    )
    .returning();

  const vehicleRows = await db
    .insert(vehicles)
    .values([
      { number: "BR01AB1234", driverName: "Ramesh", driverPhone: "9100000001" },
      { number: "BR02CD5678", driverName: "Suresh", driverPhone: "9100000002" },
    ])
    .returning();

  // One godown per firm with opening stock (500 bags of each product).
  const godownByFirm: Record<string, string> = {};
  for (const f of firmRows) {
    const [loc] = await db
      .insert(stockLocations)
      .values({ firmId: f.id, kind: "godown", name: "Main Godown" })
      .returning({ id: stockLocations.id });
    godownByFirm[f.id] = loc.id;
    await db.insert(stockMovements).values(
      productRows.map((p) => ({
        firmId: f.id,
        productId: p.id,
        locationId: loc.id,
        type: "opening",
        bags: 500,
        reason: "Demo opening stock",
        actorId: admin.id,
      })),
    );
  }

  const [fa, fb, fc] = firmRows;
  const prod = productRows[0];
  const RATE = 35000; // Rs 350 a bag, in paise

  // [shop, firm, bags, final status, bags already dispatched]
  const plan = [
    [0, fa, 100, "placed", 0],
    [1, fa, 80, "rate_filled", 0],
    [2, fa, 60, "assigned", 0],
    [3, fb, 100, "partly_dispatched", 40],
    [4, fb, 50, "dispatched", 50],
    [5, fc, 30, "cancelled", 0],
  ] as const;

  const orderIds: string[] = [];
  for (const [shopIdx, firm, bags, status, sentBags] of plan) {
    await db.transaction(async (tx) => {
      const shop = shopRows[shopIdx];
      const priced = status !== "placed";
      const [o] = await tx
        .insert(orders)
        .values({
          firmId: firm.id,
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
          { firmId: firm.id, retailerId: shop.id, kind: "order_debit", amountPaise: amount, orderId: o.id },
          ids.accounts,
          "Order approved",
        );
        if (status === "cancelled") {
          await postEntry(
            tx,
            { firmId: firm.id, retailerId: shop.id, kind: "adjustment", amountPaise: -amount, orderId: o.id },
            ids.accounts,
            "Order cancelled",
          );
        }
      }
      if (sentBags > 0) {
        const v = vehicleRows[0];
        await tx.insert(dispatches).values({
          firmId: firm.id,
          orderId: o.id,
          bags: sentBags,
          vehicleId: v.id,
          driverName: v.driverName,
          driverPhone: v.driverPhone,
          locationId: godownByFirm[firm.id],
          dispatchedBy: ids.logistics,
        });
        await tx.insert(stockMovements).values({
          firmId: firm.id,
          productId: prod.id,
          locationId: godownByFirm[firm.id],
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
    await tx.insert(receiptAllocations).values({ receiptId: r.id, firmId: fb.id, orderId: orderIds[3], amountPaise: paid });
    await postEntry(
      tx,
      { firmId: fb.id, retailerId: shop.id, kind: "receipt_credit", amountPaise: -paid },
      ids.accounts,
      `Receipt #${r.receiptNo}`,
      r.id,
    );
    await tx.insert(walletMovements).values({
      firmId: fb.id,
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
