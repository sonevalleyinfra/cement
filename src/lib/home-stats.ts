import { and, count, eq, gte, inArray, isNotNull, notExists, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  dispatches,
  ledgerEntries,
  orders,
  products,
  receipts,
  retailers,
  stockMovements,
  walletMovements,
} from "@/db/schema";
import { ordersUserMayDispatch } from "@/lib/dispatch-rules";
import { cashInHandPaise, istDayStart, logisticsCounts, retailersWithDues, totalDuesPaise } from "@/lib/home-rules";
import { firmPeople } from "@/lib/logistics";

/** Read-only numbers for the home screens. Server-only. `firmIds` is the firms in view (never empty here). */

const n = (v: number | undefined) => v ?? 0;

async function countOrders(firmIds: string[], where: ReturnType<typeof and>) {
  const [row] = await db
    .select({ c: count() })
    .from(orders)
    .where(and(inArray(orders.firmId, firmIds), where));
  return n(row?.c);
}

async function dueRows(firmIds: string[]) {
  return db
    .select({
      retailerId: ledgerEntries.retailerId,
      firmId: ledgerEntries.firmId,
      amountPaise: sql<number>`coalesce(sum(${ledgerEntries.amountPaise}), 0)`.mapWith(Number),
    })
    .from(ledgerEntries)
    .where(inArray(ledgerEntries.firmId, firmIds))
    .groupBy(ledgerEntries.retailerId, ledgerEntries.firmId);
}

export async function getSalesHome(userId: string, firmIds: string[], now = new Date()) {
  const [pendingRate, today, dues] = await Promise.all([
    countOrders(firmIds, and(eq(orders.salesRepId, userId), eq(orders.status, "placed"))),
    countOrders(firmIds, and(eq(orders.salesRepId, userId), gte(orders.createdAt, istDayStart(now)))),
    dueRows(firmIds),
  ]);
  return { pendingRate, today, retailersWithDues: retailersWithDues(dues) };
}

async function pendingHandoverPaise(firmIds: string[]) {
  const answer = db
    .select({ one: sql`1` })
    .from(sql`${walletMovements} as a`)
    .where(
      and(
        sql`a.ref_id = ${walletMovements.id}`,
        inArray(sql`a.kind`, ["handover_confirmed", "handover_rejected"]),
      ),
    );
  const [row] = await db
    .select({ p: sql<number>`coalesce(sum(${walletMovements.amountPaise}), 0)`.mapWith(Number) })
    .from(walletMovements)
    .where(
      and(
        inArray(walletMovements.firmId, firmIds),
        eq(walletMovements.kind, "handover_request"),
        notExists(answer),
      ),
    );
  return n(row?.p);
}

export async function getAccountsHome(firmIds: string[]) {
  const [approvals, unverified, cheques, cash] = await Promise.all([
    countOrders(firmIds, eq(orders.status, "rate_filled")),
    db
      .select({ c: count() })
      .from(receipts)
      .where(and(eq(receipts.mode, "online"), eq(receipts.status, "unverified"), inArray(receipts.receivedFirmId, firmIds))),
    db
      .select({ c: count() })
      .from(receipts)
      .where(and(eq(receipts.mode, "cheque"), eq(receipts.status, "pending"), inArray(receipts.receivedFirmId, firmIds))),
    pendingHandoverPaise(firmIds),
  ]);
  return {
    approvals,
    unverifiedOnline: n(unverified[0]?.c),
    pendingCheques: n(cheques[0]?.c),
    cashToConfirmPaise: cash,
  };
}

export async function stockByProduct(firmIds: string[]) {
  return db
    .select({
      productId: stockMovements.productId,
      name: products.name,
      bags: sql<number>`coalesce(sum(${stockMovements.bags}), 0)`.mapWith(Number),
    })
    .from(stockMovements)
    .innerJoin(products, eq(products.id, stockMovements.productId))
    .where(inArray(stockMovements.firmId, firmIds))
    .groupBy(stockMovements.productId, products.name)
    .orderBy(products.name);
}

/** Orders waiting for this logistics person: the same ones the dispatch list shows them. */
export async function getLogisticsHome(user: { id: string; role: string | null | undefined }, firmIds: string[]) {
  const [open, people, stock] = await Promise.all([
    db
      .select({ firmId: orders.firmId, logisticsId: orders.logisticsId, status: orders.status })
      .from(orders)
      .where(and(inArray(orders.firmId, firmIds), inArray(orders.status, ["approved", "assigned", "partly_dispatched"]))),
    firmPeople(db, firmIds),
    stockByProduct(firmIds),
  ]);
  return { ...logisticsCounts(ordersUserMayDispatch(user, open, people)), stock };
}

export async function getAdminHome(firmIds: string[], now = new Date()) {
  const start = istDayStart(now);
  const [todayOrders, bagsRow, dues, stock, collected, confirmed, reversed, approvals] = await Promise.all([
    countOrders(firmIds, gte(orders.createdAt, start)),
    db
      .select({ b: sql<number>`coalesce(sum(${dispatches.bags}), 0)`.mapWith(Number) })
      .from(dispatches)
      .where(and(inArray(dispatches.firmId, firmIds), gte(dispatches.createdAt, start))),
    dueRows(firmIds),
    stockByProduct(firmIds),
    walletSum(firmIds, "collected"),
    walletSum(firmIds, "handover_confirmed"),
    walletSum(firmIds, "reversed"),
    countOrders(firmIds, eq(orders.status, "rate_filled")),
  ]);
  return {
    todayOrders,
    bagsDispatched: n(bagsRow[0]?.b),
    duesPaise: totalDuesPaise(dues),
    stockBags: stock.reduce((s, p) => s + p.bags, 0),
    cashInHandPaise: cashInHandPaise(collected, confirmed, reversed),
    approvals,
  };
}

async function walletSum(firmIds: string[], kind: string) {
  const [row] = await db
    .select({ p: sql<number>`coalesce(sum(${walletMovements.amountPaise}), 0)`.mapWith(Number) })
    .from(walletMovements)
    .where(and(inArray(walletMovements.firmId, firmIds), eq(walletMovements.kind, kind)));
  return n(row?.p);
}

/** A retailer login's own open orders and balance (all firms). Null if the login has no shop. */
export async function getRetailerHome(userId: string) {
  const [shop] = await db
    .select({ id: retailers.id })
    .from(retailers)
    .where(and(eq(retailers.userId, userId), isNotNull(retailers.userId)))
    .limit(1);
  if (!shop) return null;
  const [open] = await db
    .select({ c: count() })
    .from(orders)
    .where(and(eq(orders.retailerId, shop.id), notInArray(orders.status, ["rejected", "delivered", "cancelled"])));
  const [bal] = await db
    .select({ p: sql<number>`coalesce(sum(${ledgerEntries.amountPaise}), 0)`.mapWith(Number) })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.retailerId, shop.id));
  return { openOrders: n(open?.c), balancePaise: n(bal?.p) };
}
