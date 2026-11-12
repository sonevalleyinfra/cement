/**
 * Purchase register & truck purchase-to-dispatch traceability as plain functions (no database).
 *
 * Traces each truck purchase from purchase time until its bags reach 0 (or the next purchase of the
 * same product on the same truck): direct dispatches to shops/sites, unloads to godowns, stock
 * adjustments/returns, and purchase reversals.
 */
import { mulDivRound } from "./money";
import { CLAIM_LABELS, claimValuePaise, isClaimStatus, parsePurchaseSource } from "./purchase-rules";
import { reasonLabel } from "./reason-codes";
import { saleValuePaise } from "./sales-report";

export type RawPurchaseRow = {
  id: string;
  movementId: string;
  createdAt: Date | string;
  invoiceDate: string;
  invoiceNo: string;
  productId: string;
  productName: string;
  brandName: string;
  vehicleId: string | null;
  placeName: string;
  truckNumber: string;
  driverName: string;
  driverPhone: string;
  billedBags: number;
  shortBags: number;
  burstBags: number;
  receivedBags: number;
  trackingId?: string;
  shortMovementId: string | null;
  burstMovementId: string | null;
  unitCostPaise: number;
  freightPaise: number;
  unloadingPaise: number;
  landedUnitCostPaise: number;
  claimStatus: string;
  actorName: string;
  note: string;
};

export type RawTruckDispatchEvent = {
  fromVehicleId: string;
  productId: string;
  createdAt: Date | string;
  bags: number;
  ratePaise: number;
  retailerName: string;
  retailerPlace: string | null;
  deliverTo: string;
  siteAddress: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
  salesRepName: string | null;
  actorName: string;
  reasonCode: string | null;
  reasonNote: string;
};

export type RawTruckMovementEvent = {
  id: string;
  vehicleId: string;
  productId: string;
  type: string;
  bags: number;
  createdAt: Date | string;
  reversesMovementId: string | null;
  reasonCode: string | null;
  reason: string;
  actorName: string;
  transferToGodownName?: string | null;
};

export type PurchaseTruckStep =
  | {
      kind: "dispatch";
      at: Date | string;
      bags: number;
      retailerName: string;
      retailerPlace: string | null;
      deliverTo: string;
      siteAddress: string | null;
      receiverName: string | null;
      receiverPhone: string | null;
      ratePaise: number;
      valuePaise: number;
      salesRepName: string | null;
      actorName: string;
      reasonLabel: string | null;
    }
  | {
      kind: "transfer_out";
      at: Date | string;
      bags: number;
      godownName: string;
      actorName: string;
    }
  | {
      kind: "adjustment";
      at: Date | string;
      bags: number;
      reasonText: string;
      actorName: string;
    }
  | {
      kind: "purchase_reversal";
      at: Date | string;
      bags: number;
      reasonText: string;
      actorName: string;
    };

export type PurchaseTripStatus = "Completed (0 left)" | "Active" | "Superseded" | "Godown";

export type PurchaseRegisterRow = {
  id: string;
  movementId: string;
  vehicleId: string | null;
  productId: string;
  createdAt: Date | string;
  invoiceDate: string;
  invoiceNo: string;
  productName: string;
  brandName: string;
  placeName: string;
  trackingId: string;
  sourceLabel: string;
  truckNumber: string;
  driverName: string;
  driverPhone: string;
  billedBags: number;
  shortBags: number;
  burstBags: number;
  receivedBags: number;
  reversedBags: number;
  netBags: number;
  unitCostPaise: number;
  baseAmountPaise: number;
  freightPaise: number;
  unloadingPaise: number;
  landedUnitCostPaise: number;
  totalLandedPaise: number;
  claimStatus: string;
  claimLabel: string;
  claimAmountPaise: number;
  actorName: string;
  note: string;
  tripStatus: PurchaseTripStatus;
  dispatchedBagsFromTrip: number;
  transferredToGodownBags: number;
  adjustedBagsInTrip: number;
  remainingBagsFromTrip: number;
  steps: PurchaseTruckStep[];
};

export type PurchaseGroupLine = {
  key: string;
  label: string;
  purchases: number;
  billedBags: number;
  receivedBags: number;
  netBags: number;
  baseAmountPaise: number;
  totalLandedPaise: number;
};

export type PurchaseReport = {
  totals: {
    count: number;
    billedBags: number;
    shortBags: number;
    burstBags: number;
    receivedBags: number;
    reversedBags: number;
    netBags: number;
    baseAmountPaise: number;
    freightPaise: number;
    unloadingPaise: number;
    totalLandedPaise: number;
    dispatchedBags: number;
    transferredToGodownBags: number;
    remainingBags: number;
    openClaimValuePaise: number;
  };
  purchases: PurchaseRegisterRow[];
  byProduct: PurchaseGroupLine[];
  bySource: PurchaseGroupLine[];
};

function toMs(d: Date | string): number {
  return d instanceof Date ? d.getTime() : new Date(d).getTime();
}

function addGroup(
  map: Map<string, PurchaseGroupLine>,
  key: string,
  label: string,
  row: Pick<PurchaseRegisterRow, "billedBags" | "receivedBags" | "netBags" | "baseAmountPaise" | "totalLandedPaise">,
) {
  const line = map.get(key) ?? {
    key,
    label,
    purchases: 0,
    billedBags: 0,
    receivedBags: 0,
    netBags: 0,
    baseAmountPaise: 0,
    totalLandedPaise: 0,
  };
  line.purchases += 1;
  line.billedBags += row.billedBags;
  line.receivedBags += row.receivedBags;
  line.netBags += row.netBags;
  line.baseAmountPaise += row.baseAmountPaise;
  line.totalLandedPaise += row.totalLandedPaise;
  map.set(key, line);
}

/**
 * Builds the purchase register + truck trip traceability report.
 *
 * `inRangePurchases` are the rows within the picked report dates; `allSameTruckPurchases` lets the
 * function find the next purchase boundary on `(vehicleId, productId)` so each truck purchase stops
 * its trip right before the truck is reloaded with the same product (or finishes at 0 bags).
 */
export function buildPurchaseReport({
  inRangePurchases,
  allSameTruckPurchases = inRangePurchases,
  dispatchEvents = [],
  movementEvents = [],
  currentBalances = new Map<string, number>(),
}: {
  inRangePurchases: readonly RawPurchaseRow[];
  allSameTruckPurchases?: readonly Pick<RawPurchaseRow, "id" | "vehicleId" | "productId" | "createdAt">[];
  dispatchEvents?: readonly RawTruckDispatchEvent[];
  movementEvents?: readonly RawTruckMovementEvent[];
  /** Keyed by `${vehicleId}:${productId}` -> current live bags on that truck for that product. */
  currentBalances?: ReadonlyMap<string, number>;
}): PurchaseReport {
  // Index purchase windows per (vehicleId:productId) chronologically
  const windowsByKey = new Map<string, { id: string; startMs: number; nextStartMs: number }[]>();
  const byKey = new Map<string, { id: string; startMs: number }[]>();
  for (const p of allSameTruckPurchases) {
    if (!p.vehicleId) continue;
    const key = `${p.vehicleId}:${p.productId}`;
    const list = byKey.get(key) ?? [];
    list.push({ id: p.id, startMs: toMs(p.createdAt) });
    byKey.set(key, list);
  }
  for (const [key, list] of byKey) {
    list.sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
    windowsByKey.set(
      key,
      list.map((item, idx) => ({
        id: item.id,
        startMs: item.startMs,
        nextStartMs: idx + 1 < list.length ? list[idx + 1].startMs : Number.POSITIVE_INFINITY,
      })),
    );
  }

  // Reversals directly keyed by purchase stockMovementId
  const reversalsByMovement = new Map<string, RawTruckMovementEvent[]>();
  for (const m of movementEvents) {
    if (m.type === "purchase_reversal" && m.reversesMovementId) {
      const list = reversalsByMovement.get(m.reversesMovementId) ?? [];
      list.push(m);
      reversalsByMovement.set(m.reversesMovementId, list);
    }
  }

  const rows: PurchaseRegisterRow[] = inRangePurchases.map((p) => {
    const revEvents = reversalsByMovement.get(p.movementId) ?? [];
    const reversedBags = revEvents.reduce((sum, r) => sum + Math.max(0, -r.bags), 0);
    const netBags = Math.max(0, p.receivedBags - reversedBags);
    const baseAmountPaise = mulDivRound(p.billedBags, p.unitCostPaise, 1);
    const totalLandedPaise = mulDivRound(p.receivedBags, p.landedUnitCostPaise, 1);
    const sourceLabel = parsePurchaseSource(p.note) ?? "Plant / Direct";
    const claimLabel = isClaimStatus(p.claimStatus) ? CLAIM_LABELS[p.claimStatus] : p.claimStatus;
    const lostBags = p.shortBags + p.burstBags;
    const claimAmountPaise = lostBags > 0 ? claimValuePaise(lostBags, p.unitCostPaise) : 0;

    const steps: PurchaseTruckStep[] = [];
    for (const r of revEvents) {
      steps.push({
        kind: "purchase_reversal",
        at: r.createdAt,
        bags: Math.max(0, -r.bags),
        reasonText: [reasonLabel(r.reasonCode, "reversal"), r.reason].filter(Boolean).join(" · ") || "Reversed",
        actorName: r.actorName,
      });
    }

    let dispatchedBagsFromTrip = 0;
    let transferredToGodownBags = 0;
    let adjustedBagsInTrip = 0;
    let tripStatus: PurchaseTripStatus = p.vehicleId ? "Active" : "Godown";
    let remainingBagsFromTrip = netBags;

    if (p.vehicleId) {
      const key = `${p.vehicleId}:${p.productId}`;
      const wins = windowsByKey.get(key) ?? [];
      const win = wins.find((w) => w.id === p.id) ?? {
        id: p.id,
        startMs: toMs(p.createdAt),
        nextStartMs: Number.POSITIVE_INFINITY,
      };
      const isLatestTrip = win.nextStartMs === Number.POSITIVE_INFINITY;

      for (const d of dispatchEvents) {
        if (d.fromVehicleId !== p.vehicleId || d.productId !== p.productId) continue;
        const t = toMs(d.createdAt);
        if (t < win.startMs || t >= win.nextStartMs) continue;
        dispatchedBagsFromTrip += d.bags;
        steps.push({
          kind: "dispatch",
          at: d.createdAt,
          bags: d.bags,
          retailerName: d.retailerName,
          retailerPlace: d.retailerPlace,
          deliverTo: d.deliverTo,
          siteAddress: d.siteAddress,
          receiverName: d.receiverName,
          receiverPhone: d.receiverPhone,
          ratePaise: d.ratePaise,
          valuePaise: saleValuePaise(d.bags, d.ratePaise),
          salesRepName: d.salesRepName,
          actorName: d.actorName,
          reasonLabel: d.bags < 0 ? [reasonLabel(d.reasonCode, "reversal"), d.reasonNote].filter(Boolean).join(" · ") || "Returned" : null,
        });
      }

      for (const m of movementEvents) {
        if (m.vehicleId !== p.vehicleId || m.productId !== p.productId) continue;
        if (m.id === p.movementId || m.id === p.shortMovementId || m.id === p.burstMovementId) continue;
        if (m.type === "purchase" || m.type === "purchase_reversal" || m.type === "dispatch") continue;
        const t = toMs(m.createdAt);
        if (t < win.startMs || t >= win.nextStartMs) continue;

        if (m.type === "transfer" && m.bags < 0) {
          const outBags = -m.bags;
          transferredToGodownBags += outBags;
          steps.push({
            kind: "transfer_out",
            at: m.createdAt,
            bags: outBags,
            godownName: m.transferToGodownName || "Godown",
            actorName: m.actorName,
          });
        } else if (m.type === "adjustment" || m.type === "return" || m.type === "opening" || (m.type === "transfer" && m.bags > 0)) {
          adjustedBagsInTrip += m.bags;
          const label =
            m.type === "return"
              ? [reasonLabel(m.reasonCode, "reversal"), m.reason || "Order return"].filter(Boolean).join(" · ")
              : [reasonLabel(m.reasonCode, "stock"), m.reason].filter(Boolean).join(" · ") || m.type;
          steps.push({
            kind: "adjustment",
            at: m.createdAt,
            bags: m.bags,
            reasonText: label,
            actorName: m.actorName,
          });
        }
      }

      remainingBagsFromTrip = Math.max(0, netBags - dispatchedBagsFromTrip - transferredToGodownBags + adjustedBagsInTrip);
      const liveBal = currentBalances.get(key);
      if (isLatestTrip && liveBal !== undefined && liveBal <= 0) {
        remainingBagsFromTrip = 0;
      }

      if (remainingBagsFromTrip === 0) {
        tripStatus = "Completed (0 left)";
      } else if (!isLatestTrip) {
        tripStatus = "Superseded";
      } else {
        tripStatus = "Active";
      }
    }

    steps.sort((a, b) => toMs(a.at) - toMs(b.at));

    return {
      id: p.id,
      trackingId: p.trackingId ?? "",
      movementId: p.movementId,
      vehicleId: p.vehicleId,
      productId: p.productId,
      createdAt: p.createdAt,
      invoiceDate: p.invoiceDate,
      invoiceNo: p.invoiceNo,
      productName: p.productName,
      brandName: p.brandName,
      placeName: p.placeName,
      sourceLabel,
      truckNumber: p.truckNumber,
      driverName: p.driverName,
      driverPhone: p.driverPhone,
      billedBags: p.billedBags,
      shortBags: p.shortBags,
      burstBags: p.burstBags,
      receivedBags: p.receivedBags,
      reversedBags,
      netBags,
      unitCostPaise: p.unitCostPaise,
      baseAmountPaise,
      freightPaise: p.freightPaise,
      unloadingPaise: p.unloadingPaise,
      landedUnitCostPaise: p.landedUnitCostPaise,
      totalLandedPaise,
      claimStatus: p.claimStatus,
      claimLabel,
      claimAmountPaise,
      actorName: p.actorName,
      note: p.note,
      tripStatus,
      dispatchedBagsFromTrip,
      transferredToGodownBags,
      adjustedBagsInTrip,
      remainingBagsFromTrip,
      steps,
    };
  });

  // Sort newest purchase first for display; compute totals and groupings
  rows.sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt) || b.id.localeCompare(a.id));

  const productMap = new Map<string, PurchaseGroupLine>();
  const sourceMap = new Map<string, PurchaseGroupLine>();
  const totals: PurchaseReport["totals"] = {
    count: rows.length,
    billedBags: 0,
    shortBags: 0,
    burstBags: 0,
    receivedBags: 0,
    reversedBags: 0,
    netBags: 0,
    baseAmountPaise: 0,
    freightPaise: 0,
    unloadingPaise: 0,
    totalLandedPaise: 0,
    dispatchedBags: 0,
    transferredToGodownBags: 0,
    remainingBags: 0,
    openClaimValuePaise: 0,
  };

  for (const r of rows) {
    totals.billedBags += r.billedBags;
    totals.shortBags += r.shortBags;
    totals.burstBags += r.burstBags;
    totals.receivedBags += r.receivedBags;
    totals.reversedBags += r.reversedBags;
    totals.netBags += r.netBags;
    totals.baseAmountPaise += r.baseAmountPaise;
    totals.freightPaise += r.freightPaise;
    totals.unloadingPaise += r.unloadingPaise;
    totals.totalLandedPaise += r.totalLandedPaise;
    totals.dispatchedBags += r.dispatchedBagsFromTrip;
    totals.transferredToGodownBags += r.transferredToGodownBags;
    totals.remainingBags += r.remainingBagsFromTrip;
    if (r.claimStatus === "open" || r.claimStatus === "claimed") {
      totals.openClaimValuePaise += r.claimAmountPaise;
    }
    addGroup(productMap, r.productId, r.productName, r);
    addGroup(sourceMap, r.sourceLabel, r.sourceLabel, r);
  }

  const byValue = (a: PurchaseGroupLine, b: PurchaseGroupLine) =>
    b.totalLandedPaise - a.totalLandedPaise || b.netBags - a.netBags || a.label.localeCompare(b.label);

  return {
    totals,
    purchases: rows,
    byProduct: [...productMap.values()].sort(byValue),
    bySource: [...sourceMap.values()].sort(byValue),
  };
}
