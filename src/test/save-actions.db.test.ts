/**
 * The main saves, run for real: the app's own server actions against the test database
 * (TEST_DATABASE_URL), signed in as a test admin, sales person, accountant and logistics person.
 * Only the sign-in and the database connection are swapped (src/test/save-kit.ts).
 *
 * One story, in order: buy a truckload, place an order, approve it, change its quantity,
 * dispatch it, take a cash payment, hand the cash over. Each step checks the books afterwards,
 * and that a double tap or a refused save leaves nothing behind.
 */
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/db", async () => {
  const kit = await import("@/test/save-kit");
  return { db: kit.testDb(), schema: await import("@/db/schema") };
});
vi.mock("@/lib/session", async () => (await import("@/test/save-kit")).sessionMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

import { dispatchOrder } from "@/app/(app)/dispatch/actions";
import { decideOrder, placeOrder, updateOrderBags } from "@/app/(app)/orders/actions";
import { saveReceipt } from "@/app/(app)/receipts/actions";
import { recordPurchase } from "@/app/(app)/stock/actions";
import { answerHandover, requestHandover } from "@/app/(app)/wallet/actions";
import { auditLog, dispatches, orders, purchases, receipts, supplierLedgerEntries, vehicles } from "@/db/schema";
import { toISTDateKey } from "@/lib/datetime";
import { NEW_TRUCK_PLACE } from "@/lib/stock-rules";
import { walletBalance } from "@/lib/wallet-rules";
import {
  bagsOnTruck,
  closeTestDb,
  duesOf,
  formId,
  makePerson,
  makeProduct,
  makeShop,
  signIn,
  testDb,
  truckNumber,
  url,
  walletRows,
} from "@/test/save-kit";

const COST = 30_000; // ₹300 a bag from the supplier
const RATE = 35_000; // ₹350 a bag to the shop

describe.skipIf(!url)("the main saves (real actions, real database)", () => {
  const db = testDb();
  const today = toISTDateKey(new Date());
  let admin: Awaited<ReturnType<typeof makePerson>>;
  let sales: typeof admin;
  let accounts: typeof admin;
  let logistics: typeof admin;
  let product: Awaited<ReturnType<typeof makeProduct>>;
  let shopId: string;
  let truck: string;
  let truckId: string;
  let orderId: string;

  const orderNow = async () => (await db.select().from(orders).where(eq(orders.id, orderId)))[0];
  const logged = async (entity: string, action: string, entityId: string) =>
    (await db.select({ id: auditLog.id }).from(auditLog).where(and(eq(auditLog.entity, entity), eq(auditLog.action, action), eq(auditLog.entityId, entityId))))
      .length;

  beforeAll(async () => {
    if (!url) return;
    [admin, sales, accounts, logistics] = await Promise.all([makePerson("admin"), makePerson("sales"), makePerson("accounts"), makePerson("logistics")]);
    product = await makeProduct();
    shopId = await makeShop({ salesRepId: sales.id, creditLimitPaise: 100_000_000 });
    truck = truckNumber();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  function purchaseForm(over: Record<string, unknown> = {}) {
    return {
      brandId: product.brandId,
      channel: product.channel,
      typeId: product.typeId,
      gradeId: product.gradeId,
      place: NEW_TRUCK_PLACE,
      truck: { number: truck, driverName: "Ravi", driverPhone: "9876543210" },
      bags: 100,
      note: "",
      costPerBagPaise: COST,
      invoiceNo: `INV-${truck}`,
      invoiceDate: today,
      requestId: formId(),
      ...over,
    };
  }

  it("purchase: 100 bags land on the truck and the supplier is owed for them; a double tap adds nothing", async () => {
    signIn(admin);
    const form = purchaseForm();
    const first = await recordPurchase(form);
    expect(first.ok).toBe(true);
    [{ id: truckId }] = await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.number, truck));
    expect(await bagsOnTruck(truckId, product.productId)).toBe(100);

    const owed = await db.select().from(supplierLedgerEntries).where(eq(supplierLedgerEntries.brandId, product.brandId));
    expect(owed.map((e) => e.amountPaise)).toEqual([100 * COST]);
    expect(await db.select().from(purchases).where(eq(purchases.truckNumber, truck))).toHaveLength(1);

    // The same form sent again (double tap): same answer, nothing new.
    expect((await recordPurchase(form)).ok).toBe(true);
    expect(await bagsOnTruck(truckId, product.productId)).toBe(100);
    expect(await db.select().from(supplierLedgerEntries).where(eq(supplierLedgerEntries.brandId, product.brandId))).toHaveLength(1);
  });

  it("purchase: a truck that still holds bags is refused and nothing is kept", async () => {
    signIn(admin);
    const res = await recordPurchase(purchaseForm({ invoiceNo: "INV-second" }));
    expect(res).toEqual({ ok: false, error: `Truck ${truck} still has 100 bags. Empty it before a new purchase.` });
    expect(await bagsOnTruck(truckId, product.productId)).toBe(100);
    expect(await db.select().from(purchases).where(eq(purchases.truckNumber, truck))).toHaveLength(1);
  });

  it("purchase: only someone allowed may buy", async () => {
    signIn(sales);
    await expect(recordPurchase(purchaseForm())).rejects.toThrow("redirect:/dashboard");
  });

  it("order: sales places 60 bags with a rate; a double tap places one order", async () => {
    signIn(sales);
    const form = { retailerId: shopId, productId: product.productId, bags: 60, rateRupees: "350", source: "phone", requestId: formId() };
    expect(await placeOrder(form)).toEqual({ ok: true });
    expect(await placeOrder(form)).toEqual({ ok: true });
    const rows = await db.select().from(orders).where(eq(orders.retailerId, shopId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ bags: 60, ratePaise: RATE, status: "placed", placedBy: sales.id, salesRepId: sales.id });
    orderId = rows[0].id;
    expect(await logged("order", "place", orderId)).toBe(1);
  });

  it("dispatch: an order that is not approved cannot be dispatched", async () => {
    signIn(logistics);
    const res = await dispatchOrder({ orderId, bags: 10, vehicleNumber: truck, fromPlace: `vehicle:${truckId}`, driverName: "Ravi", driverPhone: "9876543210", requestId: formId() });
    expect(res.ok).toBe(false);
    expect(await bagsOnTruck(truckId, product.productId)).toBe(100);
    expect(await duesOf(shopId)).toBe(0);
  });

  it("approval: accounts approves at the rate on their screen; a stale rate is refused", async () => {
    signIn(accounts);
    expect((await decideOrder(orderId, "approved", null, null, RATE + 100)).ok).toBe(false);
    expect((await orderNow()).status).toBe("placed");
    expect(await decideOrder(orderId, "approved", null, null, RATE)).toEqual({ ok: true });
    expect((await orderNow()).status).toBe("approved");
  });

  it("quantity: adding bags to an approved order sends it back for approval", async () => {
    signIn(sales);
    expect(await updateOrderBags(orderId, 80, "customer wants more")).toEqual({ ok: true });
    expect(await orderNow()).toMatchObject({ bags: 80, status: "placed" });
    signIn(accounts);
    expect(await decideOrder(orderId, "approved", null, null, RATE)).toEqual({ ok: true });
  });

  it("dispatch: 50 bags leave the truck and the shop owes 50 × rate; a double tap sends them once", async () => {
    signIn(logistics);
    const form = { orderId, bags: 50, vehicleNumber: truck, fromPlace: `vehicle:${truckId}`, driverName: "Ravi", driverPhone: "9876543210", requestId: formId() };
    expect((await dispatchOrder(form)).ok).toBe(true);
    expect((await dispatchOrder(form)).ok).toBe(true);
    expect(await bagsOnTruck(truckId, product.productId)).toBe(50);
    expect(await duesOf(shopId)).toBe(50 * RATE);
    expect((await orderNow()).status).toBe("partly_dispatched");
    expect(await db.select().from(dispatches).where(eq(dispatches.orderId, orderId))).toHaveLength(1);
  });

  it("dispatch: more bags than the order has left, or than the truck holds, is refused and nothing moves", async () => {
    signIn(logistics);
    const base = { orderId, vehicleNumber: truck, fromPlace: `vehicle:${truckId}`, driverName: "Ravi", driverPhone: "9876543210" };
    expect((await dispatchOrder({ ...base, bags: 31, requestId: formId() })).ok).toBe(false); // 30 left on the order
    signIn(admin);
    expect(await updateOrderBags(orderId, 50)).toEqual({ ok: true }); // cut to the bags already sent
    expect((await orderNow()).status).toBe("dispatched");
    signIn(logistics);
    expect((await dispatchOrder({ ...base, bags: 1, requestId: formId() })).ok).toBe(false);
    expect(await bagsOnTruck(truckId, product.productId)).toBe(50);
    expect(await duesOf(shopId)).toBe(50 * RATE);
  });

  it("quantity: an order can never go below the bags already sent", async () => {
    signIn(admin);
    expect((await updateOrderBags(orderId, 49)).ok).toBe(false);
    expect((await orderNow()).bags).toBe(50);
  });

  it("payment: cash lowers the dues at once and sits with the person who took it; a double tap counts once", async () => {
    signIn(sales);
    const form = { retailerId: shopId, mode: "cash", totalPaise: 1_000_000, receivedOn: today, requestId: formId() };
    const first = await saveReceipt(form);
    expect(first.ok).toBe(true);
    expect(await saveReceipt(form)).toEqual(first);
    expect(await duesOf(shopId)).toBe(50 * RATE - 1_000_000);
    expect(await db.select().from(receipts).where(eq(receipts.retailerId, shopId))).toHaveLength(1);
    expect(walletBalance(await walletRows(sales.id)).availablePaise).toBe(1_000_000);
  });

  it("payment: an online payment without its bank details is refused and nothing is kept", async () => {
    signIn(sales);
    const before = await duesOf(shopId);
    const res = await saveReceipt({ retailerId: shopId, mode: "online", totalPaise: 500_000, receivedOn: today, requestId: formId() });
    expect(res.ok).toBe(false);
    expect(await duesOf(shopId)).toBe(before);
    expect(await db.select().from(receipts).where(eq(receipts.retailerId, shopId))).toHaveLength(1);
  });

  it("handover: cash cannot be handed over twice, and accounts confirming it empties the wallet", async () => {
    signIn(sales);
    expect((await requestHandover({ amountPaise: 1_000_001, requestId: formId() })).ok).toBe(false);
    const form = { amountPaise: 1_000_000, recipientName: "Office", requestId: formId() };
    expect(await requestHandover(form)).toEqual({ ok: true });
    expect(await requestHandover(form)).toEqual({ ok: true }); // double tap
    expect(await requestHandover({ amountPaise: 1, requestId: formId() })).toEqual({ ok: false, error: "That cash is already pending handover." });

    const requests = (await walletRows(sales.id)).filter((r) => r.kind === "handover_request");
    expect(requests).toHaveLength(1);

    // The person holding the cash cannot confirm their own handover.
    await expect(answerHandover(requests[0].id, { action: "confirm", amountPaise: 1_000_000 })).rejects.toThrow("redirect:/dashboard");

    signIn(accounts);
    expect(await answerHandover(requests[0].id, { action: "confirm", amountPaise: 1_000_000 })).toEqual({ ok: true });
    expect((await answerHandover(requests[0].id, { action: "confirm", amountPaise: 1_000_000 })).ok).toBe(false); // answered already
    const balance = walletBalance(await walletRows(sales.id));
    expect([balance.availablePaise, balance.pendingPaise]).toEqual([0, 0]);
  });
});
