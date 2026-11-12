import { and, asc, eq, gt, gte, inArray, isNotNull, lt, lte, or, sql, type Column } from "drizzle-orm";
import { db } from "@/db";
import {
  brands,
  dispatches,
  godowns,
  ledgerEntries,
  orderEvents,
  orders,
  products,
  purchases,
  receipts,
  retailers,
  stockMovements,
  supplierLedgerEntries,
  user,
  vehicles,
  walletMovements,
} from "@/db/schema";
import { hasManyBrands, shortProductName } from "@/lib/catalogue-rules";
import { duesAging } from "@/lib/due-items";
import { ledgerBackdatedSql, ledgerMomentSql, ledgerReversesAtSql } from "@/lib/ledger";
import { lossReport } from "@/lib/loss-report";
import { nameMaps, toMap } from "@/lib/names";
import type { ReportRange } from "@/lib/report-range";
import {
  averageCostPerBag,
  landedCostRows,
  profitReport,
  purchaseCostTotals,
  resolveDispatchOrigin,
  salesReport,
  schemeCreditsPaise,
  type PurchaseCostRow,
  type SaleRow,
} from "@/lib/sales-report";
import { buildPurchaseReport, type PurchaseReport, type RawPurchaseRow, type RawTruckDispatchEvent, type RawTruckMovementEvent } from "@/lib/purchase-report";
import { getVehicleInflowOrigins } from "@/lib/truck-origins";
import { cashByPerson, onlineWaiting, paymentsByMode, staffActivity } from "@/lib/staff-report";
import { buildStatement, byDay, byMoment } from "@/lib/statement-rules";
import { placeFlows, stockFlows, stockNow, totalFlow, totalPlaceFlow } from "@/lib/stock-report";
import { balancesByBrand } from "@/lib/supplier-rules";
import { getSuppliers } from "@/lib/suppliers";

/**
 * Read-only data for the reports (docs/idea.md section 9). Server-only.
 * The SQL only picks rows (by date); every sum, group and check is a tested plain function.
 */

/**
 * Product names for report tables on a phone: without the brand ("Trade OPC 43") while only one
 * brand is switched on, with it when there are several.
 */
async function productLabeler(): Promise<(name: string) => string> {
  const rows = await db.select({ name: brands.name, active: brands.active }).from(brands);
  const showBrand = hasManyBrands(rows.filter((b) => b.active));
  const names = rows.map((b) => b.name);
  return (name) => shortProductName(name, names, showBrand);
}

/** Dispatches in the range, with the names the sales report groups by. */
async function salesRows(range: ReportRange): Promise<SaleRow[]> {
  const [label, rows] = await Promise.all([productLabeler(), salesQuery(range)]);
  return rows.map((r) => ({ ...r, productName: label(r.productName) }));
}

async function salesQuery(range: ReportRange) {
  const [rows, names] = await Promise.all([
    db
      .select({
        bags: dispatches.bags,
        ratePaise: dispatches.ratePaise,
        createdAt: dispatches.createdAt,
        productId: orders.productId,
        productName: products.name,
        retailerId: orders.retailerId,
        retailerName: retailers.name,
        retailerPlace: retailers.place,
        deliverTo: orders.deliverTo,
        siteAddress: orders.siteAddress,
        receiverName: orders.receiverName,
        receiverPhone: orders.receiverPhone,
        dispatchedBy: dispatches.dispatchedBy,
        reasonCode: dispatches.reasonCode,
        reasonNote: dispatches.reasonNote,
        vehicleId: dispatches.vehicleId,
        trackingId: dispatches.trackingId,
        vehicleNumber: vehicles.number,
        driverName: dispatches.driverName,
        driverPhone: dispatches.driverPhone,
        fromGodownId: dispatches.fromGodownId,
        fromVehicleId: dispatches.fromVehicleId,
        godownName: godowns.name,
        // The sales person saved on the dispatch (when the bags left), so a later change of the shop's
        // sales person does not move old sales.
        salesRepId: dispatches.salesRepId,
        salesRepName: user.name,
      })
      .from(dispatches)
      .innerJoin(orders, eq(orders.id, dispatches.orderId))
      .innerJoin(products, eq(products.id, orders.productId))
      .innerJoin(retailers, eq(retailers.id, orders.retailerId))
      .leftJoin(vehicles, eq(vehicles.id, dispatches.vehicleId))
      .leftJoin(godowns, eq(godowns.id, dispatches.fromGodownId))
      .leftJoin(user, eq(user.id, dispatches.salesRepId))
      .where(and(gte(dispatches.createdAt, range.start), lt(dispatches.createdAt, range.end)))
      .orderBy(asc(dispatches.createdAt)),
    nameMaps(),
  ]);

  const vehicleNumbers = [...new Set(rows.map((r) => r.vehicleNumber).filter(Boolean))] as string[];
  const fromVehicleIds = [...new Set(rows.map((r) => r.fromVehicleId).filter((id): id is string => id !== null))];
  const [truckPurchases, vehicleInflows] = await Promise.all([
    vehicleNumbers.length > 0
      ? db
          .select({
            truckNumber: purchases.truckNumber,
            invoiceDate: purchases.invoiceDate,
            reason: stockMovements.reason,
          })
          .from(purchases)
          .innerJoin(stockMovements, eq(stockMovements.id, purchases.stockMovementId))
          .where(inArray(purchases.truckNumber, vehicleNumbers))
          .orderBy(asc(purchases.createdAt))
      : Promise.resolve([]),
    getVehicleInflowOrigins(fromVehicleIds, range.end),
  ]);

  const fallbackPurchaseByTruck = new Map<string, { invoiceDate: string; reason: string }>();
  for (const p of truckPurchases) {
    const key = p.truckNumber.toUpperCase().replace(/\s+/g, "");
    fallbackPurchaseByTruck.set(key, { invoiceDate: p.invoiceDate, reason: p.reason });
  }

  return rows.map((r) => {
    const origin = resolveDispatchOrigin(
      {
        createdAt: r.createdAt,
        productId: r.productId,
        fromGodownId: r.fromGodownId,
        fromVehicleId: r.fromVehicleId,
        godownName: r.godownName,
        vehicleNumber: r.vehicleNumber,
      },
      vehicleInflows,
      fallbackPurchaseByTruck,
    );

    return {
      ...r,
      vehicleNumber: r.vehicleNumber || "Unknown truck",
      dispatchedByName: names.people.get(r.dispatchedBy) ?? null,
      ...origin,
    };
  });
}

export async function getSalesReport(range: ReportRange) {
  return salesReport(await salesRows(range));
}

/** Dues with aging as of the last day of the range. A payment counts on the day it was received (ledgerMomentSql). */
export async function getDuesAging(range: ReportRange, conn: Pick<typeof db, "select"> = db) {
  const [rows, names] = await Promise.all([
    conn
      .select({
        retailerId: ledgerEntries.retailerId,
        kind: ledgerEntries.kind,
        amountPaise: ledgerEntries.amountPaise,
        orderId: ledgerEntries.orderId,
        createdAt: ledgerMomentSql,
        // A dispatch reversal cancels its own load's debit (due-items.ts).
        reversesAt: ledgerReversesAtSql,
      })
      .from(ledgerEntries)
      .leftJoin(receipts, eq(receipts.id, ledgerEntries.receiptId))
      // ledgerMomentSql is raw sql, so lt() would hand postgres-js the Date unencoded: bind it as text.
      .where(sql`${ledgerMomentSql} < ${range.end.toISOString()}::timestamptz`)
      .orderBy(asc(ledgerMomentSql), asc(ledgerEntries.id)),
    conn.select({ id: retailers.id, name: retailers.name }).from(retailers),
  ]);
  return duesAging(rows, toMap(names), range.to);
}

/** Retailers for the statement picker, by name. */
export async function retailerOptions() {
  return db
    .select({ id: retailers.id, name: retailers.name, place: retailers.place, phone: retailers.phone })
    .from(retailers)
    .orderBy(asc(retailers.name));
}

/**
 * One retailer's statement for the range. `createdAt` is the ledger moment (a payment counts on the
 * day it was received); `backdated` marks such a payment row (shown with its date only).
 */
export async function getRetailerStatement(retailerId: string, range: ReportRange) {
  const rows = await db
    .select({
      id: ledgerEntries.id,
      kind: ledgerEntries.kind,
      amountPaise: ledgerEntries.amountPaise,
      note: ledgerEntries.note,
      createdAt: ledgerMomentSql,
      backdated: ledgerBackdatedSql,
    })
    .from(ledgerEntries)
    .leftJoin(receipts, eq(receipts.id, ledgerEntries.receiptId))
    .where(eq(ledgerEntries.retailerId, retailerId))
    .orderBy(asc(ledgerMomentSql), asc(ledgerEntries.id));
  const at = byMoment(range);
  return buildStatement(rows, (r) => at(r.createdAt));
}

/** One brand's supplier account statement for the range (by entry date). */
export async function getSupplierStatement(brandId: string, range: ReportRange) {
  const rows = await db
    .select({
      id: supplierLedgerEntries.id,
      kind: supplierLedgerEntries.kind,
      amountPaise: supplierLedgerEntries.amountPaise,
      entryDate: supplierLedgerEntries.entryDate,
      mode: supplierLedgerEntries.mode,
      reference: supplierLedgerEntries.reference,
      note: supplierLedgerEntries.note,
    })
    .from(supplierLedgerEntries)
    .where(eq(supplierLedgerEntries.brandId, brandId))
    .orderBy(asc(supplierLedgerEntries.entryDate), asc(supplierLedgerEntries.createdAt), asc(supplierLedgerEntries.id));
  const at = byDay(range);
  return buildStatement(rows, (r) => at(r.entryDate));
}

/** What we owed each supplier at the end of the range (entries up to the To day), for the reports list. */
export async function getSupplierClosings(range: ReportRange) {
  const [suppliers, rows] = await Promise.all([
    getSuppliers(),
    db
      .select({ brandId: supplierLedgerEntries.brandId, amountPaise: supplierLedgerEntries.amountPaise })
      .from(supplierLedgerEntries)
      .where(lte(supplierLedgerEntries.entryDate, range.to)),
  ]);
  const closing = balancesByBrand(rows);
  return suppliers.map((s) => ({ id: s.id, name: s.name, balancePaise: closing.get(s.id) ?? 0 }));
}

/** Stock now by product and place, and the range's opening → closing per product and per place. */
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
  const label = await productLabeler();
  const products = new Map([...names.products].map(([id, name]) => [id, label(name)]));
  const flows = stockFlows(rows, range, products);
  const places = placeFlows(rows, range, names);
  return {
    now: stockNow(rows, { products, godowns: names.godowns, vehicles: names.vehicles }),
    flows,
    total: totalFlow(flows),
    places,
    placesTotal: totalPlaceFlow(places),
  };
}

/** Stock corrections with minus bags in the range, valued at the average purchase cost, by reason and place. */
export async function getLossReport(range: ReportRange) {
  const [rows, purchases, names] = await Promise.all([
    db
      .select({
        productId: stockMovements.productId,
        godownId: stockMovements.godownId,
        vehicleId: stockMovements.vehicleId,
        type: stockMovements.type,
        bags: stockMovements.bags,
        reasonCode: stockMovements.reasonCode,
        createdAt: stockMovements.createdAt,
      })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.type, "adjustment"),
          gte(stockMovements.createdAt, range.start),
          lt(stockMovements.createdAt, range.end),
        ),
      ),
    // Lost bags are valued at the average LANDED cost (invoice cost + freight + unloading per good bag).
    purchaseCostRows(range.end),
    nameMaps(),
  ]);
  const totals = purchaseCostTotals(purchases);
  const costs = new Map([...totals].map(([id, t]) => [id, averageCostPerBag(t)]));
  return lossReport(rows, range, costs, names);
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

/**
 * Payments received in the range by `received_on` (IST dates, both ends inclusive). Reports → Cash
 * and the owner Home "Collected" both read this, so the two always show the same rows.
 */
export function paymentsReceivedIn(range: ReportRange) {
  return db
    .select(paymentColumns)
    .from(receipts)
    .where(and(gte(receipts.receivedOn, range.from), lte(receipts.receivedOn, range.to)));
}

/** Cash held now, online waiting now, and payments received in the range (by `received_on`) by mode. */
export async function getCashReport(range: ReportRange, now = new Date()) {
  const [holders, waiting, inRange] = await Promise.all([
    getCashHolders(),
    db
      .select(paymentColumns)
      .from(receipts)
      .where(and(eq(receipts.mode, "online"), eq(receipts.status, "unverified"))),
    paymentsReceivedIn(range),
  ]);
  return {
    holders,
    heldPaise: holders.reduce((n, h) => n + h.heldPaise, 0),
    online: onlineWaiting(waiting, now),
    byMode: paymentsByMode(inRange),
  };
}

/**
 * Every purchase before `before`, as cost rows at the LANDED cost: received bags × landed cost per bag
 * from the purchase header; a purchase saved before headers existed (drizzle/0040) keeps its movement
 * bags × invoice cost. Also for the stock value screen. A purchase reversal (v2 B2) is minus bags at the
 * landed cost of the purchase it reverses (one join: the header of `reverses_movement_id`, else its own id).
 */
export async function purchaseCostRows(before: Date): Promise<PurchaseCostRow[]> {
  const rows = await db
    .select({
      type: stockMovements.type,
      productId: stockMovements.productId,
      bags: stockMovements.bags,
      unitCostPaise: stockMovements.unitCostPaise,
      receivedBags: purchases.receivedBags,
      landedUnitCostPaise: purchases.landedUnitCostPaise,
    })
    .from(stockMovements)
    .leftJoin(purchases, eq(purchases.stockMovementId, sql`coalesce(${stockMovements.reversesMovementId}, ${stockMovements.id})`))
    .where(and(inArray(stockMovements.type, ["purchase", "purchase_reversal"]), lt(stockMovements.createdAt, before)));
  return landedCostRows(rows);
}

/** Profit per product for the range, and supplier scheme credits (all brands) in the range (shown apart). */
export async function getProfitReport(range: ReportRange) {
  const [sales, purchases, credits] = await Promise.all([
    salesRows(range),
    purchaseCostRows(range.end),
    db
      .select({ kind: supplierLedgerEntries.kind, amountPaise: supplierLedgerEntries.amountPaise })
      .from(supplierLedgerEntries)
      .where(
        and(
          eq(supplierLedgerEntries.kind, "credit"),
          gte(supplierLedgerEntries.entryDate, range.from),
          lte(supplierLedgerEntries.entryDate, range.to),
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
      .select({ actorId: orderEvents.actorId, fromStatus: orderEvents.fromStatus, toStatus: orderEvents.toStatus })
      .from(orderEvents)
      .where(
        and(
          inside(orderEvents.createdAt),
          inArray(orderEvents.toStatus, ["approved", "rejected"]),
          // Only real status changes (a rate edit keeps the status).
          sql`${orderEvents.fromStatus} is distinct from ${orderEvents.toStatus}`,
          // A reversed load sends an order back to approved (v2 B2): that is not a decision.
          sql`(${orderEvents.fromStatus} is null or ${orderEvents.fromStatus} not in ('partly_dispatched', 'dispatched', 'cancelled'))`,
        ),
      ),
    // Loads only: a reversal row (minus bags, v2 B2) is not a load.
    db
      .select({ dispatchedBy: dispatches.dispatchedBy, bags: dispatches.bags })
      .from(dispatches)
      .where(and(inside(dispatches.createdAt), gt(dispatches.bags, 0))),
    db
      .select({ receivedBy: receipts.receivedBy, status: receipts.status, totalPaise: receipts.totalPaise })
      .from(receipts)
      .where(inside(receipts.createdAt)),
    getCashHolders(),
    nameMaps(),
  ]);
  return staffActivity({ orders: placed, decisions, dispatches: loads, payments, cash: holders }, names.people);
}


/** Fast summary totals of purchases recorded in `range` (for dashboard cards and KPIs). */
export async function getPurchaseTotals(range: ReportRange): Promise<{ count: number; billedBags: number; receivedBags: number; valuePaise: number }> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)`.mapWith(Number),
      billedBags: sql<number>`coalesce(sum(${purchases.billedBags}), 0)`.mapWith(Number),
      receivedBags: sql<number>`coalesce(sum(${purchases.receivedBags}), 0)`.mapWith(Number),
      valuePaise: sql<number>`coalesce(sum(${purchases.receivedBags}::bigint * ${purchases.landedUnitCostPaise}::bigint), 0)`.mapWith(Number),
    })
    .from(purchases)
    .where(and(gte(purchases.createdAt, range.start), lt(purchases.createdAt, range.end)));
  return row ?? { count: 0, billedBags: 0, receivedBags: 0, valuePaise: 0 };
}

/**
 * Full Purchase Register + Truck Purchase-to-Dispatch Journey for `range`.
 * Traces every purchased truck forward until its bags reach 0 (or the next purchase of the same product on that truck).
 */
export async function getPurchaseReport(range: ReportRange): Promise<PurchaseReport> {
  const [rawPurchases, names, label] = await Promise.all([
    db
      .select({
        id: purchases.id,
        movementId: purchases.stockMovementId,
        createdAt: purchases.createdAt,
        invoiceDate: purchases.invoiceDate,
        invoiceNo: purchases.invoiceNo,
        trackingId: purchases.trackingId,
        productId: stockMovements.productId,
        rawProductName: products.name,
        brandName: brands.name,
        vehicleId: stockMovements.vehicleId,
        godownName: godowns.name,
        vehicleNum: vehicles.number,
        truckNumber: purchases.truckNumber,
        driverName: purchases.driverName,
        driverPhone: purchases.driverPhone,
        billedBags: purchases.billedBags,
        shortBags: purchases.shortBags,
        burstBags: purchases.burstBags,
        receivedBags: purchases.receivedBags,
        shortMovementId: purchases.shortMovementId,
        burstMovementId: purchases.burstMovementId,
        unitCostPaise: stockMovements.unitCostPaise,
        freightPaise: purchases.freightPaise,
        unloadingPaise: purchases.unloadingPaise,
        landedUnitCostPaise: purchases.landedUnitCostPaise,
        claimStatus: purchases.claimStatus,
        actorId: purchases.actorId,
        note: stockMovements.reason,
      })
      .from(purchases)
      .innerJoin(stockMovements, eq(stockMovements.id, purchases.stockMovementId))
      .innerJoin(products, eq(products.id, stockMovements.productId))
      .innerJoin(brands, eq(brands.id, products.brandId))
      .leftJoin(godowns, eq(godowns.id, stockMovements.godownId))
      .leftJoin(vehicles, eq(vehicles.id, stockMovements.vehicleId))
      .where(and(gte(purchases.createdAt, range.start), lt(purchases.createdAt, range.end)))
      .orderBy(asc(purchases.createdAt), asc(purchases.id)),
    nameMaps(),
    productLabeler(),
  ]);

  if (rawPurchases.length === 0) {
    return buildPurchaseReport({ inRangePurchases: [] });
  }

  const inRangePurchases: RawPurchaseRow[] = rawPurchases.map((p) => ({
    id: p.id,
    movementId: p.movementId,
    createdAt: p.createdAt,
    invoiceDate: p.invoiceDate,
    invoiceNo: p.invoiceNo,
    trackingId: p.trackingId,
    productId: p.productId,
    productName: label(p.rawProductName),
    brandName: p.brandName,
    vehicleId: p.vehicleId,
    placeName: p.godownName ?? (p.vehicleNum ? `Truck ${p.vehicleNum}` : `Truck ${p.truckNumber}`),
    truckNumber: p.truckNumber,
    driverName: p.driverName,
    driverPhone: p.driverPhone,
    billedBags: p.billedBags,
    shortBags: p.shortBags,
    burstBags: p.burstBags,
    receivedBags: p.receivedBags,
    shortMovementId: p.shortMovementId,
    burstMovementId: p.burstMovementId,
    unitCostPaise: p.unitCostPaise ?? 0,
    freightPaise: p.freightPaise,
    unloadingPaise: p.unloadingPaise,
    landedUnitCostPaise: p.landedUnitCostPaise,
    claimStatus: p.claimStatus,
    actorName: names.people.get(p.actorId) ?? "Staff",
    note: p.note,
  }));

  const vehicleIds = [...new Set(inRangePurchases.map((p) => p.vehicleId).filter((v): v is string => v !== null))];
  const movementIds = inRangePurchases.map((p) => p.movementId);
  const earliest = inRangePurchases.reduce((min, p) => (p.createdAt < min ? p.createdAt : min), inRangePurchases[0].createdAt);
  const earliestDate = earliest instanceof Date ? earliest : new Date(earliest);

  const [allSameTruckPurchases, rawDispatches, rawMovements, godownIns, rawBalances] = await Promise.all([
    vehicleIds.length > 0
      ? db
          .select({
            id: purchases.id,
            vehicleId: stockMovements.vehicleId,
            productId: stockMovements.productId,
            createdAt: purchases.createdAt,
          })
          .from(purchases)
          .innerJoin(stockMovements, eq(stockMovements.id, purchases.stockMovementId))
          .where(inArray(stockMovements.vehicleId, vehicleIds))
      : Promise.resolve([]),
    vehicleIds.length > 0
      ? db
          .select({
            fromVehicleId: dispatches.fromVehicleId,
            productId: orders.productId,
            createdAt: dispatches.createdAt,
            bags: dispatches.bags,
            ratePaise: dispatches.ratePaise,
            retailerName: retailers.name,
            retailerPlace: retailers.place,
            deliverTo: orders.deliverTo,
            siteAddress: orders.siteAddress,
            receiverName: orders.receiverName,
            receiverPhone: orders.receiverPhone,
            salesRepId: dispatches.salesRepId,
            dispatchedBy: dispatches.dispatchedBy,
            reasonCode: dispatches.reasonCode,
            reasonNote: dispatches.reasonNote,
          })
          .from(dispatches)
          .innerJoin(orders, eq(orders.id, dispatches.orderId))
          .innerJoin(retailers, eq(retailers.id, orders.retailerId))
          .where(and(inArray(dispatches.fromVehicleId, vehicleIds), gte(dispatches.createdAt, earliestDate)))
          .orderBy(asc(dispatches.createdAt))
      : Promise.resolve([]),
    vehicleIds.length > 0
      ? db
          .select({
            id: stockMovements.id,
            vehicleId: stockMovements.vehicleId,
            productId: stockMovements.productId,
            type: stockMovements.type,
            bags: stockMovements.bags,
            createdAt: stockMovements.createdAt,
            reversesMovementId: stockMovements.reversesMovementId,
            reasonCode: stockMovements.reasonCode,
            reason: stockMovements.reason,
            actorId: stockMovements.actorId,
          })
          .from(stockMovements)
          .where(
            or(
              and(inArray(stockMovements.vehicleId, vehicleIds), gte(stockMovements.createdAt, earliestDate)),
              inArray(stockMovements.reversesMovementId, movementIds),
            ),
          )
          .orderBy(asc(stockMovements.createdAt))
      : db
          .select({
            id: stockMovements.id,
            vehicleId: stockMovements.vehicleId,
            productId: stockMovements.productId,
            type: stockMovements.type,
            bags: stockMovements.bags,
            createdAt: stockMovements.createdAt,
            reversesMovementId: stockMovements.reversesMovementId,
            reasonCode: stockMovements.reasonCode,
            reason: stockMovements.reason,
            actorId: stockMovements.actorId,
          })
          .from(stockMovements)
          .where(inArray(stockMovements.reversesMovementId, movementIds))
          .orderBy(asc(stockMovements.createdAt)),
    vehicleIds.length > 0
      ? db
          .select({
            productId: stockMovements.productId,
            bags: stockMovements.bags,
            createdAt: stockMovements.createdAt,
            godownName: godowns.name,
          })
          .from(stockMovements)
          .innerJoin(godowns, eq(godowns.id, stockMovements.godownId))
          .where(and(eq(stockMovements.type, "transfer"), gt(stockMovements.bags, 0), isNotNull(stockMovements.godownId), gte(stockMovements.createdAt, earliestDate)))
          .orderBy(asc(stockMovements.createdAt))
      : Promise.resolve([]),
    vehicleIds.length > 0
      ? db
          .select({
            vehicleId: stockMovements.vehicleId,
            productId: stockMovements.productId,
            bags: sql<number>`coalesce(sum(${stockMovements.bags}), 0)`.mapWith(Number),
          })
          .from(stockMovements)
          .where(inArray(stockMovements.vehicleId, vehicleIds))
          .groupBy(stockMovements.vehicleId, stockMovements.productId)
      : Promise.resolve([]),
  ]);

  const dispatchEvents: RawTruckDispatchEvent[] = rawDispatches.flatMap((d) =>
    d.fromVehicleId === null
      ? []
      : [
          {
            fromVehicleId: d.fromVehicleId,
            productId: d.productId,
            createdAt: d.createdAt,
            bags: d.bags,
            ratePaise: d.ratePaise,
            retailerName: d.retailerName,
            retailerPlace: d.retailerPlace,
            deliverTo: d.deliverTo,
            siteAddress: d.siteAddress,
            receiverName: d.receiverName,
            receiverPhone: d.receiverPhone,
            salesRepName: d.salesRepId ? (names.people.get(d.salesRepId) ?? null) : null,
            actorName: names.people.get(d.dispatchedBy) ?? "Staff",
            reasonCode: d.reasonCode,
            reasonNote: d.reasonNote,
          },
        ],
  );

  const usedGodownIns = new Set<number>();
  const movementEvents: RawTruckMovementEvent[] = rawMovements.flatMap((m) => {
    if (m.vehicleId === null) return [];
    let transferToGodownName: string | null = null;
    if (m.type === "transfer" && m.bags < 0) {
      const tOut = m.createdAt.getTime();
      let bestIdx = -1;
      let bestDiff = 5001;
      for (let idx = 0; idx < godownIns.length; idx++) {
        if (usedGodownIns.has(idx)) continue;
        const g = godownIns[idx];
        if (g.productId !== m.productId || g.bags !== -m.bags) continue;
        const diff = Math.abs(g.createdAt.getTime() - tOut);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestIdx = idx;
        }
      }
      if (bestIdx !== -1) {
        usedGodownIns.add(bestIdx);
        transferToGodownName = godownIns[bestIdx].godownName;
      }
    }
    return [
      {
        id: m.id,
        vehicleId: m.vehicleId,
        productId: m.productId,
        type: m.type,
        bags: m.bags,
        createdAt: m.createdAt,
        reversesMovementId: m.reversesMovementId,
        reasonCode: m.reasonCode,
        reason: m.reason,
        actorName: m.actorId ? (names.people.get(m.actorId) ?? "Staff") : "Staff",
        transferToGodownName,
      },
    ];
  });

  const currentBalances = new Map<string, number>();
  for (const b of rawBalances) {
    if (b.vehicleId) currentBalances.set(`${b.vehicleId}:${b.productId}`, b.bags);
  }

  return buildPurchaseReport({
    inRangePurchases,
    allSameTruckPurchases,
    dispatchEvents,
    movementEvents,
    currentBalances,
  });
}
