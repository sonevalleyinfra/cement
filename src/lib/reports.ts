import { and, asc, eq, gte, inArray, lt, lte, type Column } from "drizzle-orm";
import { db } from "@/db";
import {
  dispatches,
  ledgerEntries,
  orderEvents,
  orders,
  prismLedgerEntries,
  products,
  receipts,
  retailers,
  stockMovements,
  user,
  walletMovements,
} from "@/db/schema";
import { duesAging } from "@/lib/due-items";
import { nameMaps, toMap } from "@/lib/names";
import type { ReportRange } from "@/lib/report-range";
import { profitReport, salesReport, schemeCreditsPaise, type SaleRow } from "@/lib/sales-report";
import { cashByPerson, onlineWaiting, paymentsByMode, staffActivity } from "@/lib/staff-report";
import { buildStatement, byDay, byMoment } from "@/lib/statement-rules";
import { stockFlows, stockNow, totalFlow } from "@/lib/stock-report";

/**
 * Read-only data for the reports (docs/idea.md section 9). Server-only.
 * The SQL only picks rows (by date); every sum, group and check is a tested plain function.
 */

/** Dispatches in the range, with the names the sales report groups by. */
async function salesRows(range: ReportRange): Promise<SaleRow[]> {
  const rows = await db
    .select({
      bags: dispatches.bags,
      ratePaise: dispatches.ratePaise,
      createdAt: dispatches.createdAt,
      productId: orders.productId,
      productName: products.name,
      retailerId: orders.retailerId,
      retailerName: retailers.name,
      salesRepId: orders.salesRepId,
      salesRepName: user.name,
    })
    .from(dispatches)
    .innerJoin(orders, eq(orders.id, dispatches.orderId))
    .innerJoin(products, eq(products.id, orders.productId))
    .innerJoin(retailers, eq(retailers.id, orders.retailerId))
    .leftJoin(user, eq(user.id, orders.salesRepId))
    .where(and(gte(dispatches.createdAt, range.start), lt(dispatches.createdAt, range.end)))
    .orderBy(asc(dispatches.createdAt));
  return rows;
}

export async function getSalesReport(range: ReportRange) {
  return salesReport(await salesRows(range));
}

/** Dues with aging as of the last day of the range. */
export async function getDuesAging(range: ReportRange) {
  const [rows, names] = await Promise.all([
    db
      .select({
        retailerId: ledgerEntries.retailerId,
        kind: ledgerEntries.kind,
        amountPaise: ledgerEntries.amountPaise,
        orderId: ledgerEntries.orderId,
        createdAt: ledgerEntries.createdAt,
      })
      .from(ledgerEntries)
      .where(lt(ledgerEntries.createdAt, range.end))
      .orderBy(asc(ledgerEntries.createdAt), asc(ledgerEntries.id)),
    db.select({ id: retailers.id, name: retailers.name }).from(retailers),
  ]);
  return duesAging(rows, toMap(names), range.to);
}

/** Retailers for the statement picker, by name. */
export async function retailerOptions() {
  return db.select({ id: retailers.id, name: retailers.name }).from(retailers).orderBy(asc(retailers.name));
}

/** One retailer's statement for the range. */
export async function getRetailerStatement(retailerId: string, range: ReportRange) {
  const rows = await db
    .select({
      id: ledgerEntries.id,
      kind: ledgerEntries.kind,
      amountPaise: ledgerEntries.amountPaise,
      note: ledgerEntries.note,
      createdAt: ledgerEntries.createdAt,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.retailerId, retailerId))
    .orderBy(asc(ledgerEntries.createdAt), asc(ledgerEntries.id));
  const at = byMoment(range);
  return buildStatement(rows, (r) => at(r.createdAt));
}

/** The Prism account statement for the range (by entry date). */
export async function getPrismStatement(range: ReportRange) {
  const rows = await db
    .select({
      id: prismLedgerEntries.id,
      kind: prismLedgerEntries.kind,
      amountPaise: prismLedgerEntries.amountPaise,
      entryDate: prismLedgerEntries.entryDate,
      mode: prismLedgerEntries.mode,
      reference: prismLedgerEntries.reference,
      note: prismLedgerEntries.note,
    })
    .from(prismLedgerEntries)
    .orderBy(asc(prismLedgerEntries.entryDate), asc(prismLedgerEntries.createdAt), asc(prismLedgerEntries.id));
  const at = byDay(range);
  return buildStatement(rows, (r) => at(r.entryDate));
}

/** Stock now by product and place, and the range's opening → closing per product. */
export async function getStockReport(range: ReportRange) {
  const [rows, names] = await Promise.all([
    db
      .select({
        productId: stockMovements.productId,
        godownId: stockMovements.godownId,
        vehicleId: stockMovements.vehicleId,
        type: stockMovements.type,
        bags: stockMovements.bags,
        createdAt: stockMovements.createdAt,
      })
      .from(stockMovements),
    nameMaps(),
  ]);
  const flows = stockFlows(rows, range, names.products);
  return {
    now: stockNow(rows, { products: names.products, godowns: names.godowns, vehicles: names.vehicles }),
    flows,
    total: totalFlow(flows),
  };
}

async function walletRows() {
  return db
    .select({
      id: walletMovements.id,
      collectorId: walletMovements.collectorId,
      kind: walletMovements.kind,
      amountPaise: walletMovements.amountPaise,
      refId: walletMovements.refId,
    })
    .from(walletMovements);
}

/** Cash held now by each staff member (with names). */
export async function getCashHolders() {
  const [rows, names] = await Promise.all([walletRows(), nameMaps()]);
  return cashByPerson(rows, names.people);
}

const paymentColumns = {
  mode: receipts.mode,
  status: receipts.status,
  totalPaise: receipts.totalPaise,
  createdAt: receipts.createdAt,
  receivedBy: receipts.receivedBy,
};

/** Cash held now, online waiting now, and payments recorded in the range by mode. */
export async function getCashReport(range: ReportRange, now = new Date()) {
  const [holders, waiting, inRange] = await Promise.all([
    getCashHolders(),
    db
      .select(paymentColumns)
      .from(receipts)
      .where(and(eq(receipts.mode, "online"), eq(receipts.status, "unverified"))),
    db
      .select(paymentColumns)
      .from(receipts)
      .where(and(gte(receipts.createdAt, range.start), lt(receipts.createdAt, range.end))),
  ]);
  return {
    holders,
    heldPaise: holders.reduce((n, h) => n + h.heldPaise, 0),
    online: onlineWaiting(waiting, now),
    byMode: paymentsByMode(inRange),
  };
}

/** Profit per product for the range, and Prism scheme credits in the range (shown apart). */
export async function getProfitReport(range: ReportRange) {
  const [sales, purchases, credits] = await Promise.all([
    salesRows(range),
    db
      .select({ productId: stockMovements.productId, bags: stockMovements.bags, unitCostPaise: stockMovements.unitCostPaise })
      .from(stockMovements)
      .where(and(eq(stockMovements.type, "purchase"), lt(stockMovements.createdAt, range.end))),
    db
      .select({ kind: prismLedgerEntries.kind, amountPaise: prismLedgerEntries.amountPaise })
      .from(prismLedgerEntries)
      .where(
        and(
          eq(prismLedgerEntries.kind, "credit"),
          gte(prismLedgerEntries.entryDate, range.from),
          lte(prismLedgerEntries.entryDate, range.to),
        ),
      ),
  ]);
  return { ...profitReport(sales, purchases), schemeCreditsPaise: schemeCreditsPaise(credits) };
}

/** What each person did in the range, plus cash held now. */
export async function getStaffReport(range: ReportRange) {
  const inside = (col: Column) => and(gte(col, range.start), lt(col, range.end));
  const [placed, decisions, loads, payments, holders, names] = await Promise.all([
    db.select({ placedBy: orders.placedBy }).from(orders).where(inside(orders.createdAt)),
    db
      .select({ actorId: orderEvents.actorId, toStatus: orderEvents.toStatus })
      .from(orderEvents)
      .where(and(inside(orderEvents.createdAt), inArray(orderEvents.toStatus, ["approved", "rejected"]))),
    db.select({ dispatchedBy: dispatches.dispatchedBy, bags: dispatches.bags }).from(dispatches).where(inside(dispatches.createdAt)),
    db
      .select({ receivedBy: receipts.receivedBy, status: receipts.status, totalPaise: receipts.totalPaise })
      .from(receipts)
      .where(inside(receipts.createdAt)),
    getCashHolders(),
    nameMaps(),
  ]);
  return staffActivity({ orders: placed, decisions, dispatches: loads, payments, cash: holders }, names.people);
}
