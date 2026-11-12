import { describe, expect, it } from "vitest";
import { buildPurchaseReport, type RawPurchaseRow } from "./purchase-report";

const basePurchase: RawPurchaseRow = {
  id: "pur-1",
  movementId: "mov-1",
  createdAt: new Date("2026-11-10T04:00:00Z"),
  invoiceDate: "2026-11-10",
  invoiceNo: "INV-101",
  productId: "prod-1",
  productName: "Prism Champion PPC",
  brandName: "Prism",
  vehicleId: "veh-1",
  placeName: "Truck UP65AT1234",
  truckNumber: "UP65AT1234",
  driverName: "Ramesh",
  driverPhone: "9876543210",
  billedBags: 400,
  shortBags: 5,
  burstBags: 5,
  receivedBags: 390,
  shortMovementId: "mov-short",
  burstMovementId: "mov-burst",
  unitCostPaise: 32000,
  freightPaise: 400000,
  unloadingPaise: 0,
  landedUnitCostPaise: 33026,
  claimStatus: "open",
  actorName: "Admin",
  note: "Source: Satna Plant · Direct order",
};

describe("buildPurchaseReport", () => {
  it("tracks a purchased truck across dispatches & godown unload until 0 bags remain", () => {
    const report = buildPurchaseReport({
      inRangePurchases: [basePurchase],
      dispatchEvents: [
        {
          fromVehicleId: "veh-1",
          productId: "prod-1",
          createdAt: new Date("2026-11-10T07:00:00Z"),
          bags: 150,
          ratePaise: 36000,
          retailerName: "Gupta Traders",
          retailerPlace: "Chandauli",
          deliverTo: "shop",
          siteAddress: null,
          receiverName: null,
          receiverPhone: null,
          salesRepName: "Aman",
          actorName: "Logistics",
          reasonCode: null,
          reasonNote: "",
        },
        {
          fromVehicleId: "veh-1",
          productId: "prod-1",
          createdAt: new Date("2026-11-11T05:00:00Z"),
          bags: 140,
          ratePaise: 36500,
          retailerName: "Verma Cement",
          retailerPlace: "Mughalsarai",
          deliverTo: "site",
          siteAddress: "NH-2 Bypass Site",
          receiverName: "Mohan",
          receiverPhone: "9811122233",
          salesRepName: "Aman",
          actorName: "Admin",
          reasonCode: null,
          reasonNote: "",
        },
      ],
      movementEvents: [
        // Transit short & burst movements linked to purchase must NOT be double counted in adjustments
        {
          id: "mov-short",
          vehicleId: "veh-1",
          productId: "prod-1",
          type: "adjustment",
          bags: -5,
          createdAt: new Date("2026-11-10T04:00:01Z"),
          reversesMovementId: null,
          reasonCode: "transit_short",
          reason: "",
          actorName: "Admin",
        },
        // Unload remaining 100 bags to Main Godown
        {
          id: "mov-xfer",
          vehicleId: "veh-1",
          productId: "prod-1",
          type: "transfer",
          bags: -100,
          createdAt: new Date("2026-11-11T09:00:00Z"),
          reversesMovementId: null,
          reasonCode: null,
          reason: "",
          actorName: "Logistics",
          transferToGodownName: "Main Godown",
        },
      ],
      currentBalances: new Map([["veh-1:prod-1", 0]]),
    });

    expect(report.totals.count).toBe(1);
    expect(report.totals.billedBags).toBe(400);
    expect(report.totals.receivedBags).toBe(390);
    expect(report.totals.dispatchedBags).toBe(290);
    expect(report.totals.transferredToGodownBags).toBe(100);
    expect(report.totals.remainingBags).toBe(0);
    expect(report.totals.openClaimValuePaise).toBe(10 * 32000);

    const row = report.purchases[0];
    expect(row.sourceLabel).toBe("Satna Plant");
    expect(row.tripStatus).toBe("Completed (0 left)");
    expect(row.steps.map((s) => s.kind)).toEqual(["dispatch", "dispatch", "transfer_out"]);
    expect(row.steps[1].kind === "dispatch" && row.steps[1].siteAddress).toBe("NH-2 Bypass Site");
    expect(row.steps[2].kind === "transfer_out" && row.steps[2].godownName).toBe("Main Godown");
  });

  it("separates events cleanly when the same truck makes two trips for the same product", () => {
    const trip1 = { ...basePurchase, id: "pur-1", createdAt: new Date("2026-11-01T04:00:00Z"), shortMovementId: null, burstMovementId: null, shortBags: 0, burstBags: 0, receivedBags: 200, billedBags: 200 };
    const trip2 = { ...basePurchase, id: "pur-2", movementId: "mov-2", invoiceNo: "INV-202", createdAt: new Date("2026-11-05T04:00:00Z"), shortMovementId: null, burstMovementId: null, shortBags: 0, burstBags: 0, receivedBags: 300, billedBags: 300 };

    const report = buildPurchaseReport({
      inRangePurchases: [trip2],
      allSameTruckPurchases: [trip1, trip2],
      dispatchEvents: [
        {
          fromVehicleId: "veh-1",
          productId: "prod-1",
          createdAt: new Date("2026-11-02T05:00:00Z"), // belongs to trip 1
          bags: 200,
          ratePaise: 35000,
          retailerName: "Shop 1",
          retailerPlace: null,
          deliverTo: "shop",
          siteAddress: null,
          receiverName: null,
          receiverPhone: null,
          salesRepName: null,
          actorName: "Admin",
          reasonCode: null,
          reasonNote: "",
        },
        {
          fromVehicleId: "veh-1",
          productId: "prod-1",
          createdAt: new Date("2026-11-06T05:00:00Z"), // belongs to trip 2
          bags: 120,
          ratePaise: 36000,
          retailerName: "Shop 2",
          retailerPlace: null,
          deliverTo: "shop",
          siteAddress: null,
          receiverName: null,
          receiverPhone: null,
          salesRepName: null,
          actorName: "Admin",
          reasonCode: null,
          reasonNote: "",
        },
      ],
      currentBalances: new Map([["veh-1:prod-1", 180]]),
    });

    expect(report.purchases).toHaveLength(1);
    const p2 = report.purchases[0];
    expect(p2.dispatchedBagsFromTrip).toBe(120);
    expect(p2.remainingBagsFromTrip).toBe(180);
    expect(p2.tripStatus).toBe("Active");
    expect(p2.steps).toHaveLength(1);
    expect(p2.steps[0].kind === "dispatch" && p2.steps[0].retailerName).toBe("Shop 2");
  });
});
