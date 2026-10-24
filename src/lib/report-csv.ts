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
import type { SalesReport, SalesLine } from "./sales-report";
import type { Statement } from "./statement-rules";
import type { PlaceFlow, StockFlow } from "./stock-report";
import type { PaymentsByMode } from "./staff-report";
import { SUPPLIER_MODE_LABELS, supplierKindLabel, type SupplierPaymentMode } from "./supplier-rules";

type Row = (string | number)[];

const section = (title: string): Row[] => [[], [title]];

export function salesRows(r: SalesReport): Row[] {
  const lines = (title: string, label: string, list: SalesLine[]): Row[] => [
    ...section(title),
    [label, "Bags", "Value (₹)"],
    ...list.map((l): Row => [l.label, l.bags, rupees(l.valuePaise)]),
    ["Total", r.bags, rupees(r.valuePaise)],
  ];
  return [
    ["Sales"],
    ["Dispatches", "Bags", "Value (₹)"],
    [r.loads, r.bags, rupees(r.valuePaise)],
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

/** "sales_2026-04-01_2026-04-30.csv": ASCII only, safe in a header. */
export function csvFilename(report: string, from: string, to: string): string {
  return `${report.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "report"}_${from}_${to}.csv`;
}
