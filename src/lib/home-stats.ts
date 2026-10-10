import { and, count, desc, eq, gte, inArray, isNotNull, isNull, ne, notExists, sql, type SQL } from "drizzle-orm";
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
import {
  cashInHandPaise,
  isOpenOrderStatus,
  istDayStart,
  logisticsCounts,
  retailersWithDues,
  totalDuesPaise,
} from "@/lib/home-rules";
import { ORDER_STATUSES } from "@/lib/order-rules";
import { getPrismBalance } from "@/lib/prism";
import { walletBalance } from "@/lib/wallet-rules";

/** Read-only numbers for the home screens. Server-only. */

const n = (v: number | undefined) => v ?? 0;

async function countOrders(where: SQL | undefined) {
  const [row] = await db.select({ c: count() }).from(orders).where(where);
  return n(row?.c);
}

/** Balance per retailer; `salesRepId` limits it to that sales person's shops. */
async function dueRows(salesRepId?: string) {
  return db
    .select({
      retailerId: ledgerEntries.retailerId,
      amountPaise: sql<number>`coalesce(sum(${ledgerEntries.amountPaise}), 0)`.mapWith(Number),
    })
    .from(ledgerEntries)
    .innerJoin(retailers, eq(retailers.id, ledgerEntries.retailerId))
    .where(salesRepId ? eq(retailers.salesRepId, salesRepId) : undefined)
    .groupBy(ledgerEntries.retailerId);
}

/** Waiting for accounts: placed with the rate filled (isWaitingApproval in rate-rules). */
const waitingApproval = and(eq(orders.status, "placed"), isNotNull(orders.ratePaise));
/** Ready for logistics: approved or partly dispatched. */
const toDispatch = inArray(orders.status, ["approved", "partly_dispatched"]);

export async function getSalesHome(userId: string, now = new Date()) {
  const [pendingRate, today, dues] = await Promise.all([
    // "Rate to fill": my shops' placed orders with no rate yet.
    countOrders(and(eq(orders.salesRepId, userId), eq(orders.status, "placed"), isNull(orders.ratePaise))),
    countOrders(and(eq(orders.salesRepId, userId), gte(orders.createdAt, istDayStart(now)))),
    dueRows(userId),
  ]);
  return { pendingRate, today, retailersWithDues: retailersWithDues(dues), duesPaise: totalDuesPaise(dues) };
}

/** Handover requests nobody has answered yet: how many, and how much cash. */
async function pendingHandovers() {
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
    .select({
      c: count(),
      p: sql<number>`coalesce(sum(${walletMovements.amountPaise}), 0)`.mapWith(Number),
    })
    .from(walletMovements)
    .where(and(eq(walletMovements.kind, "handover_request"), notExists(answer)));
  return { count: n(row?.c), paise: n(row?.p) };
}

async function countUnverifiedOnline() {
  const [row] = await db
    .select({ c: count() })
    .from(receipts)
    .where(and(eq(receipts.mode, "online"), eq(receipts.status, "unverified")));
  return n(row?.c);
}

export async function getAccountsHome() {
  const [approvals, unverifiedOnline, handovers] = await Promise.all([
    countOrders(waitingApproval),
    countUnverifiedOnline(),
    pendingHandovers(),
  ]);
  return { approvals, unverifiedOnline, handoversToConfirm: handovers.count, cashToConfirmPaise: handovers.paise };
}

/** One staff member's cash: held now, and how much of it waits for accounts to confirm. */
export async function getMyCash(userId: string) {
  const rows = await db
    .select({ id: walletMovements.id, kind: walletMovements.kind, amountPaise: walletMovements.amountPaise, refId: walletMovements.refId })
    .from(walletMovements)
    .where(eq(walletMovements.collectorId, userId));
  const b = walletBalance(rows);
  return { heldPaise: b.balancePaise, pendingPaise: b.pendingPaise };
}

export async function stockByProduct() {
  return db
    .select({
      productId: stockMovements.productId,
      name: products.name,
      bags: sql<number>`coalesce(sum(${stockMovements.bags}), 0)`.mapWith(Number),
    })
    .from(stockMovements)
    .innerJoin(products, eq(products.id, stockMovements.productId))
    .groupBy(stockMovements.productId, products.name)
    .orderBy(products.name);
}

/** Orders waiting for logistics: the same ones the dispatch list shows. */
export async function getLogisticsHome() {
  const [open, stock] = await Promise.all([
    db.select({ status: orders.status }).from(orders).where(toDispatch),
    stockByProduct(),
  ]);
  return { ...logisticsCounts(open), stock };
}

export async function getAdminHome(now = new Date()) {
  const start = istDayStart(now);
  const [todayOrders, bagsRow, dues, stock, collected, confirmed, reversed, approvals, dispatchable, unverifiedOnline, prismPaise] = await Promise.all([
    countOrders(gte(orders.createdAt, start)),
    db
      .select({ b: sql<number>`coalesce(sum(${dispatches.bags}), 0)`.mapWith(Number) })
      .from(dispatches)
      .where(gte(dispatches.createdAt, start)),
    dueRows(),
    stockByProduct(),
    walletSum("collected"),
    walletSum("handover_confirmed"),
    walletSum("reversed"),
    countOrders(waitingApproval),
    countOrders(toDispatch),
    countUnverifiedOnline(),
    getPrismBalance(),
  ]);
  return {
    todayOrders,
    bagsDispatched: n(bagsRow[0]?.b),
    duesPaise: totalDuesPaise(dues),
    stockBags: stock.reduce((s, p) => s + p.bags, 0),
    cashInHandPaise: cashInHandPaise(collected, confirmed, reversed),
    approvals,
    toDispatch: dispatchable,
    unverifiedOnline,
    prismPaise,
  };
}

async function walletSum(kind: string) {
  const [row] = await db
    .select({ p: sql<number>`coalesce(sum(${walletMovements.amountPaise}), 0)`.mapWith(Number) })
    .from(walletMovements)
    .where(eq(walletMovements.kind, kind));
  return n(row?.p);
}

/** A retailer login's own open orders and balance. Null if the login has no shop. */
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
    .where(and(eq(orders.retailerId, shop.id), inArray(orders.status, ORDER_STATUSES.filter(isOpenOrderStatus))));
  const [bal] = await db
    .select({ p: sql<number>`coalesce(sum(${ledgerEntries.amountPaise}), 0)`.mapWith(Number) })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.retailerId, shop.id));
  // Own payments only: the newest one that was not rejected.
  const [last] = await db
    .select({ totalPaise: receipts.totalPaise, createdAt: receipts.createdAt })
    .from(receipts)
    .where(and(eq(receipts.retailerId, shop.id), ne(receipts.status, "rejected")))
    .orderBy(desc(receipts.createdAt))
    .limit(1);
  return { openOrders: n(open?.c), balancePaise: n(bal?.p), lastPayment: last ?? null };
}
