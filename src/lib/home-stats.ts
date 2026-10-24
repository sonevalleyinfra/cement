import { and, count, desc, eq, gte, inArray, isNotNull, isNull, min, or, notExists, notInArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  dispatches,
  ledgerEntries,
  orders,
  products,
  receipts,
  retailers,
  user,
  walletMovements,
} from "@/db/schema";
import {
  isOpenOrderStatus,
  istDayStart,
  LAST_PAYMENT_SKIPS,
  logisticsCounts,
  retailersWithDues,
  shopsWithoutSalesRep,
  totalDuesPaise,
  truckLoads,
} from "@/lib/home-rules";
import { ORDER_STATUSES } from "@/lib/order-rules";
import { getOverdueRows } from "@/lib/overdue";
import { collectToday, daysOfCover, monthStartIST } from "@/lib/overdue-rules";
import { getBalances } from "@/lib/stock";
import { walletBalance } from "@/lib/wallet-rules";

/** Read-only numbers for the home screens. Server-only. */

const n = (v: number | undefined) => v ?? 0;

async function countOrders(where: SQL | undefined) {
  const [row] = await db.select({ c: count() }).from(orders).where(where);
  return n(row?.c);
}

/** Balance per retailer; `salesRepId` limits it to that sales person's shops. */
export async function dueRows(salesRepId?: string) {
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

/** When the longest-waiting matching order last changed (null when none). */
async function oldestOrder(where: SQL | undefined) {
  const [row] = await db.select({ at: min(orders.updatedAt) }).from(orders).where(where);
  return row?.at ?? null;
}

/** Standing payments (not rejected or reversed) this person received since `since`. */
async function receivedSince(userId: string, since: Date) {
  const [row] = await db
    .select({ p: sql<number>`coalesce(sum(${receipts.totalPaise}), 0)`.mapWith(Number) })
    .from(receipts)
    .where(and(eq(receipts.receivedBy, userId), notInArray(receipts.status, [...LAST_PAYMENT_SKIPS]), gte(receipts.createdAt, since)));
  return n(row?.p);
}

async function dispatchedBagsSince(since: Date, salesRepId?: string) {
  const [row] = await db
    .select({ b: sql<number>`coalesce(sum(${dispatches.bags}), 0)`.mapWith(Number) })
    .from(dispatches)
    .where(and(gte(dispatches.createdAt, since), salesRepId ? eq(dispatches.salesRepId, salesRepId) : undefined));
  return n(row?.b);
}

export async function getSalesHome(userId: string, now = new Date()) {
  const month = monthStartIST(now);
  const [pendingRate, today, dues, collectedTodayPaise, collectedMonthPaise, bagsMonth, collect] = await Promise.all([
    // "Rate to fill": my shops' placed orders with no rate yet.
    countOrders(and(eq(orders.salesRepId, userId), eq(orders.status, "placed"), isNull(orders.ratePaise))),
    countOrders(and(eq(orders.salesRepId, userId), gte(orders.createdAt, istDayStart(now)))),
    dueRows(userId),
    receivedSince(userId, istDayStart(now)),
    receivedSince(userId, month),
    dispatchedBagsSince(month, userId),
    // null = the list failed to load; Home shows "Couldn't load" there and the rest still renders.
    getOverdueRows(now)
      .then((rows) => collectToday(rows, userId, 10))
      .catch(() => null),
  ]);
  return {
    pendingRate,
    today,
    retailersWithDues: retailersWithDues(dues),
    duesPaise: totalDuesPaise(dues),
    collectedTodayPaise,
    collectedMonthPaise,
    bagsMonth,
    collect,
  };
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
      oldest: min(walletMovements.createdAt),
    })
    .from(walletMovements)
    .where(and(eq(walletMovements.kind, "handover_request"), notExists(answer)));
  return { count: n(row?.c), paise: n(row?.p), oldest: row?.oldest ?? null };
}

const unverifiedOnline = and(eq(receipts.mode, "online"), eq(receipts.status, "unverified"));

export async function getAccountsHome() {
  const [approvals, oldestApproval, online, handovers] = await Promise.all([
    countOrders(waitingApproval),
    oldestOrder(waitingApproval),
    db.select({ c: count(), oldest: min(receipts.createdAt) }).from(receipts).where(unverifiedOnline),
    pendingHandovers(),
  ]);
  return {
    approvals,
    unverifiedOnline: n(online[0]?.c),
    handoversToConfirm: handovers.count,
    cashToConfirmPaise: handovers.paise,
    /** When the oldest waiting item of each card arrived (null when nothing waits). */
    oldest: { approvals: oldestApproval, online: online[0]?.oldest ?? null, handovers: handovers.oldest },
  };
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

/** Orders waiting for logistics (the same ones the dispatch list shows) and the bags on each truck now. */
export async function getLogisticsHome(now = new Date()) {
  const [open, oldestToDispatch, balances, names, dispatched14] = await Promise.all([
    db.select({ status: orders.status }).from(orders).where(toDispatch),
    oldestOrder(toDispatch),
    getBalances(),
    db.select({ id: products.id, name: products.name }).from(products),
    dispatchedBagsSince(new Date(now.getTime() - 14 * 86_400_000)),
  ]);
  const productName = new Map(names.map((p) => [p.id, p.name]));
  const trucks = truckLoads(balances.map((b) => ({ ...b, productName: productName.get(b.productId) ?? "Product" })));
  // Bags in switched-on godowns, and how many days they last at the last 14 days' pace.
  const bags = balances.filter((b) => b.kind === "godown" && b.placeActive).reduce((s, b) => s + b.bags, 0);
  return { ...logisticsCounts(open), oldestToDispatch, trucks, godown: { bags, coverDays: daysOfCover(bags, dispatched14) } };
}

/**
 * Admin home "To do": what waits on someone, and when the oldest of each arrived. The other Owner Home
 * numbers are in `owner-home.ts`; each section loads on its own.
 */
export async function getAdminHome() {
  const [approvals, oldestApproval, dispatchable, oldestDispatch, online, shops, activePeople] = await Promise.all([
    countOrders(waitingApproval),
    oldestOrder(waitingApproval),
    countOrders(toDispatch),
    oldestOrder(toDispatch),
    db.select({ c: count(), oldest: min(receipts.createdAt) }).from(receipts).where(unverifiedOnline),
    db.select({ active: retailers.active, salesRepId: retailers.salesRepId }).from(retailers),
    db.select({ id: user.id }).from(user).where(and(or(isNull(user.banned), eq(user.banned, false)), isNull(user.deletedAt))),
  ]);
  return {
    approvals,
    toDispatch: dispatchable,
    unverifiedOnline: n(online[0]?.c),
    /** When the oldest waiting item of each card arrived (null when nothing waits). */
    oldest: { approvals: oldestApproval, dispatch: oldestDispatch, online: online[0]?.oldest ?? null },
    /** Switched-on shops with no sales person (admin should give them one). */
    shopsWithoutSalesRep: shopsWithoutSalesRep(shops, new Set(activePeople.map((u) => u.id))),
  };
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
  // Own payments only: the newest one that still stands (not rejected or reversed).
  const [last] = await db
    .select({ totalPaise: receipts.totalPaise, createdAt: receipts.createdAt })
    .from(receipts)
    .where(and(eq(receipts.retailerId, shop.id), notInArray(receipts.status, [...LAST_PAYMENT_SKIPS])))
    .orderBy(desc(receipts.createdAt))
    .limit(1);
  return { openOrders: n(open?.c), balancePaise: n(bal?.p), lastPayment: last ?? null };
}
