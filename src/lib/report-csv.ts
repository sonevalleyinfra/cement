/**
 * CSV rows for the report downloads, as plain functions (no database).
 * Each takes the report object the page already shows and returns rows for `toCsv`:
 * a header row per table, sections apart by a blank row and a title row, money in rupees
 * (headers end with "(₹)"), bags as numbers, days as India "YYYY-MM-DD".
 */
import { rupees } from "./csv";
import { toISTDateKey } from "./datetime";
import { AGING_LABELS, type AgingBuckets, type DuesAging } from "./due-items";
import { ledgerEntryLabel } from "./ledger-view-rules";
import type { LossLine, LossReport, LossTotals } from "./loss-report";
import type { PurchaseReport } from "./purchase-report";
import { reasonLabel } from "./reason-codes";
import { saleValuePaise, type SalesReport, type SalesLine } from "./sales-report";
import type { Statement } from "./statement-rules";
import type { PlaceFlow, StockFlow } from "./stock-report";
import type { PaymentsByMode } from "./staff-report";
import { SUPPLIER_MODE_LABELS, supplierKindLabel, type SupplierPaymentMode } from "./supplier-rules";

type Row = (string | number)[];

const section = (title: string): Row[] => [[], [title]];

function istTime(dt: Date): string {
  return dt.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });
}

export function salesRows(r: SalesReport): Row[] {
  const dispatchRegister: Row[] = (r.dispatches || []).map((d): Row => {
    const dt = new Date(d.createdAt);
    const dateStr = toISTDateKey(dt);
    const timeStr = istTime(dt);
    const totalPaise = saleValuePaise(d.bags, d.ratePaise);
    const deliveryMode = d.deliverTo === "site" ? "Site" : "Shop";
    const statusReason =
      d.bags < 0
        ? ["Reversed", reasonLabel(d.reasonCode, "reversal"), d.reasonNote?.trim()].filter(Boolean).join(" · ")
        : "Delivered";
    return [
      dateStr,
      timeStr,
      d.vehicleNumber || "Unknown truck",
      d.driverName || "",
      d.driverPhone || "",
      d.retailerName,
      d.retailerPlace || "",
      deliveryMode,
      d.deliverTo === "site" ? d.siteAddress || "" : "",
      d.receiverName || "",
      d.receiverPhone || "",
      d.productName,
      d.bags,
      rupees(d.ratePaise),
      rupees(totalPaise),
      d.fromPlaceName || "",
      d.movementType || (d.fromPlaceName?.includes("Truck") ? "Direct Plant Truck" : "Godown Delivery"),
      d.purchaseDate || "Stock",
      d.purchaseSource || (d.fromPlaceName?.includes("Truck") ? "Direct Factory/Plant" : "Godown Stock"),
      d.salesRepName || "No sales person",
      d.dispatchedByName || "",
      statusReason,
    ];
  });
  const lines = (title: string, label: string, list: SalesLine[] = []): Row[] => [
    ...section(title),
    [label, "Bags", "Value (₹)"],
    ...(list || []).map((l): Row => [l.label, l.bags, rupees(l.valuePaise)]),
    ["Total", r.bags, rupees(r.valuePaise)],
  ];
  return [
    ["Sales"],
    ["Dispatches", "Bags", "Value (₹)"],
    [r.loads, r.bags, rupees(r.valuePaise)],
    ...section("Detailed Dispatch Register"),
    [
      "Date",
      "Time",
      "Vehicle No",
      "Driver",
      "Driver Phone",
      "Retailer / Shop",
      "Area / Place",
      "Delivery To",
      "Site Address",
      "Receiver Name",
      "Receiver Phone",
      "Product",
      "Bags",
      "Rate (₹)",
      "Total Amount (₹)",
      "Dispatched From",
      "Dispatch Type / Movement",
      "Truck Purchase Date",
      "Source (Plant / Godown)",
      "Sales Person",
      "Dispatched By",
      "Status / Reversal Reason",
    ],
    ...dispatchRegister,
    ...lines("By vehicle", "Vehicle", r.byVehicle),
    ...lines("By product", "Product", r.byProduct),
    ...lines("By retailer", "Retailer", r.byRetailer),
    ...lines("By sales person", "Sales person", r.bySalesPerson),
    ...lines("By day", "Day", r.byDay.map((l) => ({ ...l, label: l.key }))),
  ];
}

const AGING_KEYS = Object.keys(AGING_LABELS) as (keyof AgingBuckets)[];

export function duesRows(d: DuesAging, asOf: string): Row[] {
  const head: Row = ["Retailer", "Due (₹)", ...AGING_KEYS.map((k) => `${AGING_LABELS[k]} days (₹)`)];
  return [
    [`Dues and aging as of ${asOf}`],
    head,
    ...d.lines.map((l): Row => [l.name, rupees(l.duePaise), ...AGING_KEYS.map((k) => rupees(l.buckets[k]))]),
    ["Total", rupees(d.total.duePaise), ...AGING_KEYS.map((k) => rupees(d.total.buckets[k]))],
    ...section("Advances"),
    ["Retailer", "Advance (₹)"],
    ...d.advances.map((a): Row => [a.name, rupees(a.advancePaise)]),
    ["Total", rupees(d.advancesPaise)],
  ];
}

type LedgerLine = { createdAt: Date; kind: string; amountPaise: number; note: string };

export function statementRows(shop: string, from: string, to: string, s: Statement<LedgerLine>): Row[] {
  return [
    [`Statement: ${shop}`, `${from} to ${to}`],
    ["Day", "Entry", "Note", "Amount (₹)", "Balance (₹)"],
    ["", "Opening", "", "", rupees(s.openingPaise)],
    ...s.entries.map((e): Row => [
      toISTDateKey(e.createdAt),
      ledgerEntryLabel(e.kind, e.amountPaise),
      e.note,
      rupees(e.amountPaise),
      rupees(e.balancePaise),
    ]),
    ["", "Closing", "", "", rupees(s.closingPaise)],
    [],
    ["Billed (₹)", "Paid / credited (₹)"],
    [rupees(s.debitsPaise), rupees(-s.creditsPaise)],
  ];
}

type SupplierLine = {
  kind: string;
  amountPaise: number;
  entryDate: string;
  mode: string | null;
  reference: string | null;
  note: string | null;
};

export function supplierRows(brand: string, from: string, to: string, s: Statement<SupplierLine>): Row[] {
  return [
    [`Supplier statement: ${brand}`, `${from} to ${to}`],
    ["Day", "Entry", "Mode", "Reference", "Note", "Amount (₹)", "Balance (₹)"],
    ["", "Opening", "", "", "", "", rupees(s.openingPaise)],
    ...s.entries.map((e): Row => [
      e.entryDate,
      supplierKindLabel(e.kind),
      e.kind === "payment" && e.mode ? SUPPLIER_MODE_LABELS[e.mode as SupplierPaymentMode] : "",
      e.reference ?? "",
      e.kind === "opening" ? "" : (e.note ?? ""),
      rupees(e.amountPaise),
      rupees(e.balancePaise),
    ]),
    ["", "Closing", "", "", "", "", rupees(s.closingPaise)],
    [],
    ["Purchases and more (₹)", "Paid and credits (₹)"],
    [rupees(s.debitsPaise), rupees(-s.creditsPaise)],
  ];
}

type CashReport = {
  holders: { name: string; heldPaise: number; waitingPaise: number }[];
  heldPaise: number;
  byMode: PaymentsByMode;
};

export function cashRows(r: CashReport, from: string, to: string): Row[] {
  const m = r.byMode;
  return [
    ["Cash and online", `${from} to ${to}`],
    ...section("Cash held now"),
    ["Staff", "Held (₹)", "Handing over (₹)"],
    ...r.holders.map((h): Row => [h.name, rupees(h.heldPaise), rupees(h.waitingPaise)]),
    ["Total", rupees(r.heldPaise), rupees(r.holders.reduce((n, h) => n + h.waitingPaise, 0))],
    ...section("Payments recorded in the dates picked"),
    ["Mode", "Count", "Amount (₹)"],
    ["Cash", m.cash.count, rupees(m.cash.paise)],
    ["Online verified", m.onlineVerified.count, rupees(m.onlineVerified.paise)],
    ["Online waiting", m.onlineWaiting.count, rupees(m.onlineWaiting.paise)],
    ["Total", m.total.count, rupees(m.total.paise)],
    ...section("Not counted"),
    ["State", "Count", "Amount (₹)"],
    ["Reversed", m.reversed.count, rupees(m.reversed.paise)],
    ["Rejected", m.rejected.count, rupees(m.rejected.paise)],
  ];
}

type StockReport = {
  places: PlaceFlow[];
  placesTotal: Omit<PlaceFlow, "key" | "kind" | "label">;
  flows: StockFlow[];
  total: Omit<StockFlow, "productId" | "label">;
};

export function stockRows(r: StockReport, from: string, to: string): Row[] {
  const p = r.placesTotal;
  const t = r.total;
  return [
    ["Stock", `${from} to ${to}`],
    ...section("By place"),
    ["Place", "Kind", "Opening", "In", "Out", "Closing"],
    ...r.places.map((l): Row => [l.label, l.kind === "godown" ? "Godown" : "Truck", l.openingBags, l.inBags, l.outBags, l.closingBags]),
    ["Total", "", p.openingBags, p.inBags, p.outBags, p.closingBags],
    ...section("By product"),
    ["Product", "Start", "Opening stock", "Bought", "Sent", "Moved in", "Moved out", "Fixed", "End"],
    ...r.flows.map((f): Row => [
      f.label,
      f.openingBags,
      f.openingStockBags,
      f.purchasedBags,
      f.dispatchedBags,
      f.movedInBags,
      f.movedOutBags,
      f.fixedBags,
      f.closingBags,
    ]),
    ["Total", t.openingBags, t.openingStockBags, t.purchasedBags, t.dispatchedBags, t.movedInBags, t.movedOutBags, t.fixedBags, t.closingBags],
  ];
}

export function lossRows(r: LossReport, from: string, to: string): Row[] {
  const lines = (title: string, label: string, list: LossLine[]): Row[] => [
    ...section(title),
    [label, "Bags", "Value (₹)", "Cost unknown (bags)"],
    ...list.map((l): Row => line(l.label, l)),
    line("Total", r.total),
  ];
  const line = (label: string, l: LossTotals): Row => [label, l.bags, rupees(l.valuePaise), l.unvaluedBags];
  return [["Damage and loss", `${from} to ${to}`], ...lines("By reason", "Reason", r.byReason), ...lines("By place", "Place", r.byPlace)];
}

export function purchaseRows(r: PurchaseReport, from: string, to: string): Row[] {
  const t = r.totals;
  const register: Row[] = r.purchases.map((p): Row => {
    const dt = new Date(p.createdAt);
    return [
      toISTDateKey(dt),
      istTime(dt),
      p.invoiceDate,
      p.invoiceNo,
      p.brandName,
      p.productName,
      p.sourceLabel,
      p.placeName,
      p.truckNumber,
      p.driverName,
      p.driverPhone,
      p.billedBags,
      p.shortBags,
      p.burstBags,
      p.receivedBags,
      p.reversedBags,
      p.netBags,
      rupees(p.unitCostPaise),
      rupees(p.baseAmountPaise),
      rupees(p.freightPaise),
      rupees(p.unloadingPaise),
      rupees(p.landedUnitCostPaise),
      rupees(p.totalLandedPaise),
      p.claimLabel,
      p.dispatchedBagsFromTrip,
      p.transferredToGodownBags,
      p.remainingBagsFromTrip,
      p.tripStatus,
      p.actorName,
      p.note,
    ];
  });

  const journey: Row[] = [];
  for (const p of r.purchases) {
    if (p.steps.length === 0) continue;
    for (const s of p.steps) {
      const dt = new Date(s.at);
      if (s.kind === "dispatch") {
        const dest = s.deliverTo === "site" ? `Site: ${s.siteAddress || s.retailerPlace || ""}` : `Shop (${s.retailerPlace || ""})`;
        journey.push([
          p.truckNumber,
          p.invoiceNo,
          p.invoiceDate,
          p.productName,
          toISTDateKey(dt),
          istTime(dt),
          s.bags < 0 ? "Dispatch Reversal" : "Dispatch",
          `${s.retailerName} · ${dest}`,
          [s.receiverName, s.receiverPhone].filter(Boolean).join(" / "),
          s.bags,
          rupees(s.ratePaise),
          rupees(s.valuePaise),
          s.salesRepName || "No sales person",
          s.actorName,
          s.reasonLabel || p.tripStatus,
        ]);
      } else if (s.kind === "transfer_out") {
        journey.push([
          p.truckNumber,
          p.invoiceNo,
          p.invoiceDate,
          p.productName,
          toISTDateKey(dt),
          istTime(dt),
          "Unloaded to Godown",
          s.godownName,
          "",
          -s.bags,
          "",
          "",
          "",
          s.actorName,
          p.tripStatus,
        ]);
      } else if (s.kind === "purchase_reversal") {
        journey.push([
          p.truckNumber,
          p.invoiceNo,
          p.invoiceDate,
          p.productName,
          toISTDateKey(dt),
          istTime(dt),
          "Purchase Reversal",
          p.placeName,
          "",
          -s.bags,
          "",
          "",
          "",
          s.actorName,
          s.reasonText,
        ]);
      } else {
        journey.push([
          p.truckNumber,
          p.invoiceNo,
          p.invoiceDate,
          p.productName,
          toISTDateKey(dt),
          istTime(dt),
          "Stock Adjustment / Return",
          p.placeName,
          "",
          s.bags,
          "",
          "",
          "",
          s.actorName,
          s.reasonText,
        ]);
      }
    }
  }

  return [
    ["Purchases", `${from} to ${to}`],
    [
      "Purchases",
      "Billed Bags",
      "Short Bags",
      "Burst Bags",
      "Received Bags",
      "Reversed Bags",
      "Net Bags",
      "Base Value (₹)",
      "Freight (₹)",
      "Unloading (₹)",
      "Total Landed Value (₹)",
      "Dispatched from Trips",
      "Unloaded to Godown",
      "Remaining on Trucks",
    ],
    [
      t.count,
      t.billedBags,
      t.shortBags,
      t.burstBags,
      t.receivedBags,
      t.reversedBags,
      t.netBags,
      rupees(t.baseAmountPaise),
      rupees(t.freightPaise),
      rupees(t.unloadingPaise),
      rupees(t.totalLandedPaise),
      t.dispatchedBags,
      t.transferredToGodownBags,
      t.remainingBags,
    ],
    ...section("Detailed Purchase Register"),
    [
      "Entry Date",
      "Entry Time",
      "Invoice Date",
      "Invoice No",
      "Brand",
      "Product",
      "Source / Plant",
      "Destination",
      "Truck No",
      "Driver",
      "Driver Phone",
      "Billed Bags",
      "Short Bags",
      "Burst Bags",
      "Received Bags",
      "Reversed Bags",
      "Net Bags",
      "Invoice Rate (₹)",
      "Base Value (₹)",
      "Freight (₹)",
      "Unloading (₹)",
      "Landed Cost/Bag (₹)",
      "Total Landed Value (₹)",
      "Claim Status",
      "Trip Dispatched Bags",
      "Trip Unloaded to Godown",
      "Trip Remaining Bags",
      "Truck Status",
      "Entered By",
      "Note",
    ],
    ...register,
    ...section("Truck Purchase-to-Dispatch Journey"),
    [
      "Truck No",
      "Invoice No",
      "Invoice Date",
      "Product",
      "Event Date",
      "Event Time",
      "Movement / Event",
      "Delivered To / Place",
      "Receiver",
      "Bags",
      "Rate (₹)",
      "Amount (₹)",
      "Sales Person",
      "Staff",
      "Status / Reason",
    ],
    ...journey,
    ...section("By Product"),
    ["Product", "Purchases", "Billed Bags", "Received Bags", "Net Bags", "Base Value (₹)", "Landed Value (₹)"],
    ...r.byProduct.map((l): Row => [l.label, l.purchases, l.billedBags, l.receivedBags, l.netBags, rupees(l.baseAmountPaise), rupees(l.totalLandedPaise)]),
    ...section("By Source / Plant"),
    ["Source", "Purchases", "Billed Bags", "Received Bags", "Net Bags", "Base Value (₹)", "Landed Value (₹)"],
    ...r.bySource.map((l): Row => [l.label, l.purchases, l.billedBags, l.receivedBags, l.netBags, rupees(l.baseAmountPaise), rupees(l.totalLandedPaise)]),
  ];
}

/** "sales_2026-04-01_2026-04-30.csv": ASCII only, safe in a header. */
export function csvFilename(report: string, from: string, to: string): string {
  return `${report.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "report"}_${from}_${to}.csv`;
}
