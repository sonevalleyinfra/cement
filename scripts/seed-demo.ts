/**
 * Fills a LOCAL database with demo data: one user per role, retailers, trucks,
 * a godown with opening stock, orders in different statuses (dues come from their dispatches)
 * supplier accounts: Prism (an opening balance, purchases with a cost per bag, a payment and a scheme
 * credit) and a second brand, UltraTech (one product, one purchase and one payment, no opening),
 * and payments: cash by sales and logistics, one handover confirmed and one waiting, online
 * payments waiting / verified / rejected, and one reversed cash payment.
 * Orders carry a source, "needed by" dates, two site deliveries, shop and staff notes, and the rejected,
 * cancelled, reversed and corrected rows carry reason codes (lib/reason-codes.ts).
 * Four areas, and every shop's master data and credit terms (with a first credit-history row).
 * Run with `pnpm seed:demo` (after `pnpm dev` has created the tables and the admin).
 * Safe to run twice: it skips whatever already exists (orders are added only once).
 * Some orders, dispatches and one payment are back-dated (up to 120 days) so the reports show history and aging.
 * Refuses to run on production or a non-local database (rules in scripts/lib/demo-seed-rules.ts).
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  areas,
  auditLog,
  brands,
  creditLimitChanges,
  cementTypes,
  dispatches,
  grades,
  ledgerEntries,
  orderEvents,
  orders,
  products,
  receipts,
  retailers,
  godowns,
  stockMovements,
  supplierLedgerEntries,
  user,
  vehicles,
  walletMovements,
} from "@/db/schema";
import { env } from "@/env";
import type { AuditEntry } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { toISTDateKey } from "@/lib/datetime";
import { postEntry, type DbOrTx } from "@/lib/ledger";
import { dispatchEntry } from "@/lib/ledger-rules";
import { productName } from "@/lib/catalogue-rules";
import { postSupplierEntry } from "@/lib/suppliers";
import { creditEntry, openingEntry as supplierOpening, paymentEntry, purchaseEntry } from "@/lib/supplier-rules";
import { addDaysToKey, type OrderSource } from "@/lib/order-delivery-rules";
import { stockFixText } from "@/lib/stock-rules";
import { planReversal } from "@/lib/receipt-reversal";
import { planReceipt, planVerify } from "@/lib/receipt-rules";
import { statusAfterDispatch, type OrderStatus } from "@/lib/order-rules";
import { creditChange } from "@/lib/credit-rules";
import type { CreditStatus, ShopCategory } from "@/lib/shop-lists";
import { DEMO_PASSWORD, DEMO_USERS, demoSeedBlocker } from "./lib/demo-seed-rules";

/** A demo user (with a phone, like users added on the Users page). */
async function ensureUser(email: string, name: string, role: string, phone: string): Promise<string> {
  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  const id =
    existing?.id ??
    (
      await auth.api.createUser({
        body: { email, password: DEMO_PASSWORD, name, role: role as "admin", data: { emailVerified: true } },
      })
    ).user.id;
  await db.update(user).set({ phone }).where(and(eq(user.id, id), eq(user.phone, "")));
  return id;
}

/**
 * One activity-log row for something the seed created, dated like that row (so the log reads in
 * the right order and the Books check finds it). Insert only: the log is append-only.
 */
const log = (conn: DbOrTx, entry: AuditEntry, createdAt: Date) =>
  conn.insert(auditLog).values({
    actorId: entry.actorId,
    entity: entry.entity,
    entityId: entry.entityId,
    action: entry.action,
    details: entry.details ?? {},
    createdAt,
  });

/** Days before today, as "YYYY-MM-DD" (India). */
const daysAgo = (n: number) => toISTDateKey(Date.now() - n * 86_400_000);
/** The moment `n` days ago (for back-dated demo rows, so reports have history). */
const at = (n: number) => new Date(Date.now() - n * 86_400_000);

type Built = { ok: true; entry: Parameters<typeof postSupplierEntry>[1] } | { ok: false; error: string };
const entry = (r: Built) => {
  if (!r.ok) throw new Error(r.error);
  return r.entry;
};

async function mainGodownId(): Promise<string> {
  const [godown] = await db
    .select({ id: godowns.id })
    .from(godowns)
    .where(sql`lower(${godowns.name}) = 'main godown'`);
  if (!godown) throw new Error("Main Godown missing.");
  return godown.id;
}

async function hasSupplierEntries(brandId: string): Promise<boolean> {
  const [any] = await db
    .select({ id: supplierLedgerEntries.id })
    .from(supplierLedgerEntries)
    .where(eq(supplierLedgerEntries.brandId, brandId))
    .limit(1);
  return Boolean(any);
}

/**
 * The Prism account: we owed Rs 2,00,000 at the start; 200 bags of every Prism product bought at a cost
 * (the product at index i costs Rs 280 + Rs 5 x i a bag, plus a second, dearer buy of the first one);
 * Rs 5,00,000 paid by bank; a Rs 15,000 scheme credit. Skipped if the Prism account already has entries.
 */
async function seedPrism(adminId: string, prismId: string, productRows: { id: string; name: string; brandId: string }[]) {
  if (await hasSupplierEntries(prismId)) return;
  const godownId = await mainGodownId();
  await db.transaction(async (tx) => {
    await postSupplierEntry(tx, entry(supplierOpening([], prismId, 20_000_000, daysAgo(30))), adminId);
    const buys = [
      ...productRows.map((p, i) => ({ p, bags: 200, costPaise: 28_000 + 500 * i, ago: 20, invoice: `DEMO-INV-${i + 1}` })),
      { p: productRows[0], bags: 100, costPaise: 29_500, ago: 5, invoice: "DEMO-INV-13" },
    ];
    for (const b of buys) {
      const [moved] = await tx
        .insert(stockMovements)
        .values({
          productId: b.p.id,
          godownId,
          type: "purchase",
          bags: b.bags,
          unitCostPaise: b.costPaise,
          reason: "Demo purchase",
          actorId: adminId,
          createdAt: at(b.ago),
        })
        .returning({ id: stockMovements.id });
      const owed = purchaseEntry(b.p, b.bags, b.costPaise, daysAgo(b.ago), {
        reference: b.invoice,
        description: `${b.bags} bags ${b.p.name} at Rs ${b.costPaise / 100}`,
      });
      await postSupplierEntry(tx, entry(owed), adminId, moved.id, { audit: false });
      await log(
        tx,
        {
          actorId: adminId,
          entity: "stock",
          entityId: moved.id,
          action: "purchase",
          details: {
            productId: b.p.id,
            bags: b.bags,
            place: `godown:${godownId}`,
            unitCostPaise: b.costPaise,
            amountPaise: b.bags * b.costPaise,
            brandId: b.p.brandId,
            invoiceNo: b.invoice,
          },
        },
        at(b.ago),
      );
    }
    await postSupplierEntry(tx, entry(paymentEntry(prismId, 50_000_000, "bank", "DEMOUTRPRISM1", daysAgo(10))), adminId);
    await postSupplierEntry(tx, entry(creditEntry(prismId, 1_500_000, "Demo festival scheme", daysAgo(3))), adminId);
  });
  console.log("[seed-demo] Prism account ready.");
}

/**
 * A second brand so the multi-brand screens show: UltraTech, one product (UltraTech Trade OPC 53),
 * 100 bags bought at Rs 390 into Main Godown 6 days ago, and Rs 20,000 paid by bank 2 days ago.
 * No opening balance (so one can be set by hand). Skipped if the UltraTech account already has entries.
 */
async function seedUltraTech(adminId: string) {
  await db.insert(brands).values({ name: "UltraTech" }).onConflictDoNothing();
  const [brand] = await db.select().from(brands).where(eq(brands.name, "UltraTech"));
  if (await hasSupplierEntries(brand.id)) return;
  const [grade] = await db
    .select({ id: grades.id, name: grades.name, code: cementTypes.code })
    .from(grades)
    .innerJoin(cementTypes, eq(cementTypes.id, grades.typeId))
    .where(and(eq(cementTypes.code, "OPC"), eq(grades.name, "53")));
  if (!grade) throw new Error("Grade OPC 53 missing.");
  const name = productName({ brand: brand.name, channel: "trade", typeCode: grade.code, grade: grade.name, bagKg: 50 });
  await db.insert(products).values({ name, brandId: brand.id, channel: "trade", gradeId: grade.id, bagKg: 50 }).onConflictDoNothing();
  const [product] = await db.select().from(products).where(eq(products.name, name));
  const godownId = await mainGodownId();
  await db.transaction(async (tx) => {
    const [moved] = await tx
      .insert(stockMovements)
      .values({
        productId: product.id,
        godownId,
        type: "purchase",
        bags: 100,
        unitCostPaise: 39_000,
        reason: "Demo purchase",
        actorId: adminId,
        createdAt: at(6),
      })
      .returning({ id: stockMovements.id });
    const owed = purchaseEntry(product, 100, 39_000, daysAgo(6), {
      reference: "DEMO-UT-1",
      description: `100 bags ${product.name} at Rs 390`,
    });
    await postSupplierEntry(tx, entry(owed), adminId, moved.id, { audit: false });
    await log(
      tx,
      {
        actorId: adminId,
        entity: "stock",
        entityId: moved.id,
        action: "purchase",
        details: {
          productId: product.id,
          bags: 100,
          place: `godown:${godownId}`,
          unitCostPaise: 39_000,
          amountPaise: 100 * 39_000,
          brandId: brand.id,
          invoiceNo: "DEMO-UT-1",
        },
      },
      at(6),
    );
    await postSupplierEntry(tx, entry(paymentEntry(brand.id, 2_000_000, "bank", "DEMOUTRULTRA1", daysAgo(2))), adminId);
  });
  console.log("[seed-demo] UltraTech account ready.");
}

/** Both supplier accounts (each skipped if it already has entries). */
async function seedSuppliers(adminId: string, prismId: string, productRows: { id: string; name: string; brandId: string }[]) {
  await seedPrism(adminId, prismId, productRows);
  await seedUltraTech(adminId);
}

const AREAS = ["Patna City", "Gaya Road", "Arrah Bazar", "North Bihar"];

/** The demo areas, found again if they already exist (new ones get their activity row). */
async function seedAreas(adminId: string): Promise<Map<string, string>> {
  await db.transaction(async (tx) => {
    const added = await tx
      .insert(areas)
      .values(AREAS.map((name, i) => ({ name, sortOrder: i })))
      .onConflictDoNothing()
      .returning({ id: areas.id, name: areas.name });
    for (const a of added) {
      await log(tx, { actorId: adminId, entity: "area", entityId: a.id, action: "create", details: { name: a.name } }, new Date());
    }
  });
  const rows = await db.select({ id: areas.id, name: areas.name }).from(areas).where(inArray(areas.name, AREAS));
  return new Map(rows.map((a) => [a.name, a.id]));
}

type DemoMaster = {
  ownerName: string;
  altPhone: string | null;
  address: string;
  area: string;
  pincode: string;
  lat: number;
  lng: number;
  category: ShopCategory;
  openedOn: string;
  gstin: string | null;
  creditLimitPaise: number | null;
  creditDays: number | null;
  creditStatus: CreditStatus;
};

/** Master data and credit terms of the 6 demo shops (same order as `shops`). GSTINs have a valid checksum. */
const MASTER: DemoMaster[] = [
  { ownerName: "Rajesh Sharma", altPhone: "9431000001", address: "Ashok Rajpath, near Gandhi Maidan", area: "Patna City", pincode: "800004", lat: 25.6176, lng: 85.1453, category: "retailer", openedOn: "2012-04-15", gstin: "10AABCS1429B1Z9", creditLimitPaise: 20_000_000, creditDays: 30, creditStatus: "ok" },
  { ownerName: "Anil Gupta", altPhone: null, address: "Station Road", area: "Gaya Road", pincode: "823001", lat: 24.7955, lng: 85.0002, category: "sub_dealer", openedOn: "2008-01-10", gstin: "10AAKFG4821M1ZH", creditLimitPaise: 50_000_000, creditDays: 45, creditStatus: "ok" },
  { ownerName: "Vikram Singh", altPhone: "9431000003", address: "Main Bazar", area: "Arrah Bazar", pincode: "802301", lat: 25.5541, lng: 84.6603, category: "contractor", openedOn: "2016-07-01", gstin: null, creditLimitPaise: 20_000_000, creditDays: null, creditStatus: "hold" },
  { ownerName: "Sunil Kumar", altPhone: null, address: "Motijheel", area: "North Bihar", pincode: "842001", lat: 26.1209, lng: 85.3647, category: "retailer", openedOn: "2019-11-20", gstin: null, creditLimitPaise: 30_000_000, creditDays: 30, creditStatus: "ok" },
  { ownerName: "Manoj Yadav", altPhone: "9431000005", address: "Tilka Manjhi Chowk", area: "North Bihar", pincode: "812001", lat: 25.2425, lng: 86.9842, category: "builder", openedOn: "2021-03-05", gstin: null, creditLimitPaise: null, creditDays: null, creditStatus: "ok" },
  { ownerName: "Ravi Mishra", altPhone: null, address: "Tower Chowk", area: "North Bihar", pincode: "846004", lat: 26.1542, lng: 85.8918, category: "institution", openedOn: "2010-09-12", gstin: null, creditLimitPaise: null, creditDays: null, creditStatus: "ok" },
];

/** The retailers columns for one demo shop's master data and credit terms. */
function masterValues(m: DemoMaster, areaIds: Map<string, string>) {
  const { area, ...rest } = m;
  return { ...rest, areaId: areaIds.get(area) ?? null, geoCapturedAt: new Date() };
}

/**
 * Fills the master data of demo shops that have none yet (owner name empty), and gives each shop with
 * credit terms one history row (no terms → terms, by admin) with its activity row, once.
 */
async function seedShopMaster(adminId: string, shopRows: { id: string; ownerName: string | null }[], areaIds: Map<string, string>) {
  await db.transaction(async (tx) => {
    for (const [i, shop] of shopRows.entries()) {
      const m = MASTER[i];
      if (shop.ownerName === null) {
        await tx.update(retailers).set(masterValues(m, areaIds)).where(eq(retailers.id, shop.id));
      }
      const change = creditChange(
        { limitPaise: null, creditDays: null, status: "ok" },
        { limitPaise: m.creditLimitPaise, creditDays: m.creditDays, status: m.creditStatus },
        "Demo terms",
      );
      if (!change) continue;
      const [had] = await tx
        .select({ id: creditLimitChanges.id })
        .from(creditLimitChanges)
        .where(eq(creditLimitChanges.retailerId, shop.id))
        .limit(1);
      if (had) continue;
      const now = new Date();
      await tx.insert(creditLimitChanges).values({ retailerId: shop.id, changedBy: adminId, ...change, createdAt: now });
      await log(
        tx,
        {
          actorId: adminId,
          entity: "retailer",
          entityId: shop.id,
          action: "credit_change",
          details: {
            before: { limitPaise: change.oldLimitPaise, creditDays: change.oldCreditDays, status: change.oldStatus },
            after: { limitPaise: change.newLimitPaise, creditDays: change.newCreditDays, status: change.newStatus },
            note: change.note,
          },
        },
        now,
      );
    }
  });
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

  // Prism is the main brand: orders, opening stock and most purchases use its products.
  const [prism] = await db
    .select({ id: brands.id })
    .from(brands)
    .where(sql`lower(trim(${brands.name})) = 'prism'`);
  if (!prism) throw new Error("Prism brand missing. Run migrations first.");
  const productRows = await db.select().from(products).where(eq(products.brandId, prism.id)).orderBy(products.name);
  if (productRows.length < 1) throw new Error("Products missing. Run migrations first.");

  const ids: Record<string, string> = {};
  for (const u of DEMO_USERS) ids[u.role] = await ensureUser(u.email, u.name, u.role, u.phone);
  console.log("[seed-demo] Users ready.");

  const areaIds = await seedAreas(admin.id);

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
        ...masterValues(MASTER[i], areaIds),
      })),
    )
    .onConflictDoNothing();
  const found = await db.select().from(retailers).where(inArray(retailers.phone, phones));
  const shopRows = phones.map((phone) => found.find((r) => r.phone === phone)!);
  await seedShopMaster(admin.id, shopRows, areaIds);
  console.log("[seed-demo] Areas, shop details and credit terms ready.");

  // Everything below runs once: skipped if the first demo shop already has an order.
  const [already] = await db.select({ id: orders.id }).from(orders).where(eq(orders.retailerId, shopRows[0].id)).limit(1);
  if (already) {
    await seedSuppliers(admin.id, prism.id, productRows);
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
  const opened = await db
    .insert(stockMovements)
    .values(
      productRows.map((p) => ({
        productId: p.id,
        godownId: godown.id,
        type: "opening",
        bags: 500,
        reason: "Demo opening stock",
        actorId: admin.id,
        createdAt: at(120),
      })),
    )
    .returning({ id: stockMovements.id, productId: stockMovements.productId });
  await db.insert(auditLog).values(
    opened.map((m) => ({
      actorId: admin.id,
      entity: "stock",
      entityId: m.id,
      action: "opening",
      details: { productId: m.productId, bags: 500, place: `godown:${godown.id}` },
      createdAt: at(120),
    })),
  );

  const prod = productRows[0];
  const RATE = 35000; // Rs 350 a bag, in paise

  // Admin corrects the stock: 2 bags burst on the way in (a reason code and a note).
  const fixNote = "torn while unloading";
  const [fixed] = await db
    .insert(stockMovements)
    .values({
      productId: prod.id,
      godownId: godown.id,
      type: "adjustment",
      bags: -2,
      reason: stockFixText("transit_burst", fixNote),
      reasonCode: "transit_burst",
      actorId: admin.id,
      createdAt: at(110),
    })
    .returning({ id: stockMovements.id });
  await db.insert(auditLog).values({
    actorId: admin.id,
    entity: "stock",
    entityId: fixed.id,
    action: "adjustment",
    details: { productId: prod.id, bags: -2, place: `godown:${godown.id}`, reasonCode: "transit_burst", reason: stockFixText("transit_burst", fixNote) },
    createdAt: at(110),
  });

  // [shop, bags, final status, loads dispatched]. Shop 0 is the retailer login's shop: its order
  // was placed by the retailer and waits for the sales person to fill the rate.
  const plan: [number, number, OrderStatus, number[]][] = [
    [0, 100, "placed", []],
    [1, 80, "placed", []],
    [2, 60, "approved", []],
    [3, 100, "partly_dispatched", [40]],
    [4, 50, "dispatched", [30, 20]],
    [5, 30, "cancelled", []],
    [2, 40, "rejected", []],
  ];
  // Delivery, source and notes for each order above (same position). One staff note talks about the
  // rate, so a click-through as the shop shows it never leaks.
  const today = toISTDateKey(new Date());
  type Extra = {
    source: OrderSource;
    requiredIn?: number;
    site?: { address: string; name: string; phone: string };
    shopNote?: string;
    staffNote?: string;
  };
  const extras: Extra[] = [
    { source: "shop_app", requiredIn: 3, shopNote: "Please send before noon" },
    {
      source: "rep_visit",
      requiredIn: 2,
      site: { address: "Plot 12, Patliputra Colony (new house)", name: "Mohan", phone: "9123456781" },
      staffNote: "Wants Rs 5 off the rate; told no",
    },
    { source: "phone", requiredIn: 1, shopNote: "Call before coming" },
    {
      source: "whatsapp",
      requiredIn: -1,
      site: { address: "Road No. 5, Kankarbagh (shop extension)", name: "Anil", phone: "9123456782" },
      shopNote: "Unload at the back gate",
    },
    { source: "office" },
    { source: "rep_visit", requiredIn: 5, staffNote: "Owner travelling this week" },
    { source: "phone", requiredIn: 4 },
  ];

  const orderIds: string[] = [];
  for (const [i, [shopIdx, bags, status, loads]] of plan.entries()) {
    const extra = extras[i];
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
          deliverTo: extra.site ? "site" : "shop",
          siteAddress: extra.site?.address ?? null,
          receiverName: extra.site?.name ?? null,
          receiverPhone: extra.site?.phone ?? null,
          requiredBy: extra.requiredIn === undefined ? null : addDaysToKey(today, extra.requiredIn),
          source: extra.source,
          shopNote: extra.shopNote ?? "",
          staffNote: extra.staffNote ?? "",
          placedBy: byRetailer ? ids.retailer : ids.sales,
          salesRepId: ids.sales,
        })
        .returning();
      orderIds.push(o.id);

      // History, one second apart so it shows in the right order.
      let clock = Date.now() - 60_000;
      let from: string | null = null;
      const facts = { retailerId: shop.id, productId: prod.id, bags };
      const event = async (to: string, actorId: string, reason = "", reasonCode: string | null = null) => {
        const when = new Date((clock += 1000));
        await tx
          .insert(orderEvents)
          .values({ orderId: o.id, fromStatus: from, toStatus: to, actorId, reason, reasonCode, createdAt: when });
        // The activity log row shares the history row's moment (the Books check matches on it).
        const action = ({ placed: "place", approved: "approve", rejected: "reject", cancelled: "cancel" } as const)[
          to as "placed"
        ];
        if (action) {
          const why = { reasonCode, ...(reason ? { note: reason } : {}) };
          const details =
            to === "cancelled"
              ? { ...facts, cancelledBags: bags, ...why }
              : to === "rejected"
                ? { ...facts, ratePaise: o.ratePaise, ...why }
                : to === "placed"
                  ? { ...facts, ratePaise: o.ratePaise, source: o.source, deliverTo: o.deliverTo, requiredBy: o.requiredBy }
                  : { ...facts, ratePaise: o.ratePaise };
          await log(tx, { actorId, entity: "order", entityId: o.id, action, details } as AuditEntry, when);
        }
        from = to;
      };
      await event("placed", byRetailer ? ids.retailer : ids.sales);
      if (status === "rejected") await event("rejected", ids.accounts, "", "rate_dispute");
      else if (status !== "placed") await event("approved", ids.accounts);

      // Each load takes bags out of the godown and bills them: bags x rate (one ledger debit per load).
      let sent = 0;
      for (const load of loads) {
        sent += load;
        const [sentRow] = await tx
          .insert(dispatches)
          .values({
            orderId: o.id,
            bags: load,
            vehicleId: truck.id,
            driverName: truck.driverName,
            driverPhone: truck.driverPhone,
            fromGodownId: godown.id,
            ratePaise: RATE,
            salesRepId: ids.sales,
            dispatchedBy: ids.logistics,
          })
          .returning({ id: dispatches.id, createdAt: dispatches.createdAt });
        await log(
          tx,
          {
            actorId: ids.logistics,
            entity: "dispatch",
            entityId: sentRow.id,
            action: "create",
            details: { ...facts, orderId: o.id, bags: load, ratePaise: RATE, amountPaise: load * RATE, from: `godown:${godown.id}`, truck: truck.number },
          },
          sentRow.createdAt,
        );
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
      if (status === "cancelled") await event("cancelled", admin.id, "Shop closed for repairs", "shop_asked");
    });
  }

  // Older, fully dispatched orders, so the reports have history: sales on several days, dues of
  // different ages (0-30, 31-60, 61-90, 90+), and more than one product.
  // [shop, product index, bags, rate, loads as [bags, days ago]]
  const history: [number, number, number, number, [number, number][]][] = [
    [1, 0, 60, 34_000, [[40, 100], [20, 45]]],
    [2, 1, 30, 33_000, [[30, 70]]],
    [5, 2, 50, 36_000, [[50, 20]]],
    [0, 0, 20, 35_000, [[20, 8]]],
  ];
  for (const [shopIdx, productIdx, bags, rate, loads] of history) {
    const product = productRows[productIdx] ?? prod;
    await db.transaction(async (tx) => {
      const placedAt = at(loads[0][1] + 1);
      const [o] = await tx
        .insert(orders)
        .values({
          retailerId: shopRows[shopIdx].id,
          productId: product.id,
          bags,
          ratePaise: rate,
          status: "dispatched",
          source: "rep_visit",
          placedBy: ids.sales,
          salesRepId: ids.sales,
          createdAt: placedAt,
          updatedAt: placedAt,
        })
        .returning();
      await tx.insert(orderEvents).values([
        { orderId: o.id, fromStatus: null, toStatus: "placed", actorId: ids.sales, createdAt: placedAt },
        { orderId: o.id, fromStatus: "placed", toStatus: "approved", actorId: ids.accounts, createdAt: placedAt },
      ]);
      const facts = { retailerId: o.retailerId, productId: product.id, bags, ratePaise: rate };
      await log(tx, { actorId: ids.sales, entity: "order", entityId: o.id, action: "place", details: facts }, placedAt);
      await log(tx, { actorId: ids.accounts, entity: "order", entityId: o.id, action: "approve", details: facts }, placedAt);
      let sent = 0;
      for (const [load, ago] of loads) {
        sent += load;
        const when = at(ago);
        const [sentRow] = await tx
          .insert(dispatches)
          .values({
            orderId: o.id,
            bags: load,
            vehicleId: truck.id,
            driverName: truck.driverName,
            driverPhone: truck.driverPhone,
            fromGodownId: godown.id,
            ratePaise: rate,
            salesRepId: ids.sales,
            dispatchedBy: ids.logistics,
            createdAt: when,
          })
          .returning({ id: dispatches.id });
        await log(
          tx,
          {
            actorId: ids.logistics,
            entity: "dispatch",
            entityId: sentRow.id,
            action: "create",
            details: { ...facts, orderId: o.id, bags: load, amountPaise: load * rate, from: `godown:${godown.id}`, truck: truck.number },
          },
          when,
        );
        await tx.insert(stockMovements).values({
          productId: product.id,
          godownId: godown.id,
          type: "dispatch",
          bags: -load,
          orderId: o.id,
          reason: `Truck ${truck.number}`,
          actorId: ids.logistics,
          createdAt: when,
        });
        const debit = dispatchEntry(o, load, rate);
        if (!debit.ok) throw new Error(debit.error);
        await tx.insert(ledgerEntries).values({
          retailerId: o.retailerId,
          kind: debit.entry.kind,
          amountPaise: debit.entry.amountPaise,
          orderId: o.id,
          note: `${load} bags in ${truck.number}`,
          actorId: ids.logistics,
          createdAt: when,
        });
        await tx.insert(orderEvents).values({
          orderId: o.id,
          fromStatus: sent === load ? "approved" : "partly_dispatched",
          toStatus: statusAfterDispatch(bags, sent),
          actorId: ids.logistics,
          reason: `${load} bags in ${truck.number}`,
          createdAt: when,
        });
      }
    });
  }
  // Gupta paid Rs 10,000 cash 50 days ago (it clears part of their oldest load); sales handed it over the next day.
  await db.transaction(async (tx) => {
    const [r] = await tx
      .insert(receipts)
      .values({
        retailerId: shopRows[1].id,
        mode: "cash",
        totalPaise: 1_000_000,
        status: "received",
        receivedBy: ids.sales,
        createdAt: at(50),
        updatedAt: at(50),
      })
      .returning();
    await log(
      tx,
      {
        actorId: ids.sales,
        entity: "payment",
        entityId: r.id,
        action: "record",
        details: { receiptNo: r.receiptNo, retailerId: r.retailerId, mode: "cash", amountPaise: r.totalPaise },
      },
      at(50),
    );
    await tx.insert(ledgerEntries).values({
      retailerId: r.retailerId,
      kind: "receipt_credit",
      amountPaise: -r.totalPaise,
      receiptId: r.id,
      note: `Payment #${r.receiptNo}`,
      actorId: ids.sales,
      createdAt: at(50),
    });
    await tx
      .insert(walletMovements)
      .values({ collectorId: ids.sales, kind: "collected", amountPaise: r.totalPaise, receiptId: r.id, actorId: ids.sales, createdAt: at(50) });
    const [req] = await tx
      .insert(walletMovements)
      .values({ collectorId: ids.sales, kind: "handover_request", amountPaise: r.totalPaise, actorId: ids.sales, createdAt: at(49) })
      .returning();
    await tx.insert(walletMovements).values({
      collectorId: ids.sales,
      kind: "handover_confirmed",
      amountPaise: r.totalPaise,
      refId: req.id,
      actorId: ids.accounts,
      createdAt: at(49),
    });
    const handoverFacts = { collectorId: ids.sales, amountPaise: r.totalPaise, requestedPaise: r.totalPaise };
    await log(tx, { actorId: ids.sales, entity: "handover", entityId: req.id, action: "request", details: { collectorId: ids.sales, amountPaise: r.totalPaise } }, at(49));
    await log(tx, { actorId: ids.accounts, entity: "handover", entityId: req.id, action: "confirm", details: handoverFacts }, at(49));
  });

  // Payments (spec section 6). Amounts in paise.
  // Cash is "received": the dues go down at once and the person who took it holds the cash.
  const cash = (shopIdx: number, paise: number, by: string) =>
    db.transaction(async (tx) => {
      const plan = planReceipt({ retailerId: shopRows[shopIdx].id, mode: "cash", totalPaise: paise });
      if (!plan.ok || !plan.ledger) throw new Error("Bad demo cash payment");
      const [r] = await tx
        .insert(receipts)
        .values({ retailerId: shopRows[shopIdx].id, mode: "cash", totalPaise: paise, status: plan.status, receivedBy: by })
        .returning();
      await postEntry(tx, plan.ledger, by, `Payment #${r.receiptNo}`, r.id);
      await tx.insert(walletMovements).values({ collectorId: by, kind: "collected", amountPaise: paise, receiptId: r.id, actorId: by });
      await log(
        tx,
        { actorId: by, entity: "payment", entityId: r.id, action: "record", details: paymentFacts(r) },
        r.createdAt,
      );
      return r;
    });
  const paymentFacts = (r: { receiptNo: number; retailerId: string; mode: string; totalPaise: number; receivedBy: string; utr?: string | null }) => ({
    receiptNo: r.receiptNo,
    retailerId: r.retailerId,
    mode: r.mode,
    amountPaise: r.totalPaise,
    collectorId: r.receivedBy,
    ...(r.utr ? { utr: r.utr } : {}),
  });
  // Online is "unverified" (dues unchanged) until accounts verify or reject it.
  const online = async (shopIdx: number, paise: number, by: string, utr: string, result: "unverified" | "verified" | "rejected") => {
    const plan = planReceipt({ retailerId: shopRows[shopIdx].id, mode: "online", totalPaise: paise, utr });
    if (!plan.ok) throw new Error(plan.error);
    await db.transaction(async (tx) => {
      const [r] = await tx
        .insert(receipts)
        .values({
          retailerId: shopRows[shopIdx].id,
          mode: "online",
          totalPaise: paise,
          utr: plan.utr,
          status: result,
          receivedBy: by,
          checkedBy: result === "unverified" ? null : ids.accounts,
          checkedAt: result === "unverified" ? null : new Date(),
          reasonCode: result === "rejected" ? "not_in_bank" : null,
          rejectReason: result === "rejected" ? "Not in the bank statement" : "",
        })
        .returning();
      // Recorded first, then verified or rejected, as in the app.
      await log(tx, { actorId: by, entity: "payment", entityId: r.id, action: "record", details: paymentFacts(r) }, r.createdAt);
      if (result !== "unverified") {
        await log(
          tx,
          {
            actorId: ids.accounts,
            entity: "payment",
            entityId: r.id,
            action: result === "verified" ? "verify" : "reject",
            details: {
              ...paymentFacts(r),
              ...(result === "rejected" ? { reasonCode: "not_in_bank", note: "Not in the bank statement" } : {}),
            },
          },
          new Date(r.createdAt.getTime() + 1000),
        );
      }
      if (result === "verified") {
        const v = planVerify("accounts", { ...r, status: "unverified" });
        if (!v.ok) throw new Error(v.error);
        await postEntry(tx, v.ledger, ids.accounts, `Payment #${r.receiptNo} (online)`, r.id);
      }
    });
  };
  const handover = async (by: string, paise: number, answer: "pending" | "confirmed") => {
    const [req] = await db
      .insert(walletMovements)
      .values({ collectorId: by, kind: "handover_request", amountPaise: paise, actorId: by })
      .returning();
    await log(db, { actorId: by, entity: "handover", entityId: req.id, action: "request", details: { collectorId: by, amountPaise: paise } }, req.createdAt);
    if (answer === "confirmed") {
      const [done] = await db
        .insert(walletMovements)
        .values({ collectorId: by, kind: "handover_confirmed", amountPaise: paise, refId: req.id, actorId: ids.accounts })
        .returning();
      await log(
        db,
        { actorId: ids.accounts, entity: "handover", entityId: req.id, action: "confirm", details: { collectorId: by, amountPaise: paise, requestedPaise: paise } },
        done.createdAt,
      );
    }
  };

  // Sales takes Rs 10,000 cash from Kumar Cement Store and Rs 2,000 from Sharma Traders.
  await cash(3, 1_000_000, ids.sales);
  const wrong = await cash(0, 200_000, ids.sales);
  // Accounts reverse the Rs 2,000 (wrong shop) while sales still holds it.
  await db.transaction(async (tx) => {
    const plan = planReversal("accounts", wrong, "wrong_shop", "", "holder", { balancePaise: 1_200_000, availablePaise: 1_200_000 });
    if (!plan.ok) throw new Error(plan.error);
    await postEntry(
      tx,
      { retailerId: wrong.retailerId, kind: plan.ledgerKind, amountPaise: plan.ledgerPaise },
      ids.accounts,
      plan.note,
      wrong.id,
    );
    await tx.insert(walletMovements).values({
      collectorId: ids.sales,
      kind: "reversed",
      amountPaise: plan.walletPaise,
      receiptId: wrong.id,
      actorId: ids.accounts,
    });
    await tx
      .update(receipts)
      .set({ status: "reversed", reversedAt: new Date(), reversedBy: ids.accounts, reasonCode: plan.code, reversalReason: plan.reason })
      .where(eq(receipts.id, wrong.id));
    await log(
      tx,
      {
        actorId: ids.accounts,
        entity: "payment",
        entityId: wrong.id,
        action: "reverse",
        details: { ...paymentFacts(wrong), reasonCode: plan.code, cashWith: "holder" },
      },
      new Date(),
    );
  });
  // Sales hands over Rs 6,000 (confirmed by accounts) and keeps Rs 4,000.
  await handover(ids.sales, 600_000, "confirmed");
  // Logistics takes Rs 5,000 cash from Yadav Enterprises and asks to hand it over (waiting for accounts).
  await cash(4, 500_000, ids.logistics);
  await handover(ids.logistics, 500_000, "pending");
  // Online: one waiting for accounts, one verified, one rejected.
  await online(4, 700_000, ids.logistics, "DEMOUTR0001", "unverified");
  await online(3, 400_000, ids.sales, "DEMOUTR0002", "verified");
  await online(2, 300_000, ids.sales, "DEMOUTR0003", "rejected");

  await seedSuppliers(admin.id, prism.id, productRows);

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
