import { describe, expect, it } from "vitest";
import {
  bagsLeftToReverse,
  isReversibleOrderStatus,
  planDispatchReversal,
  planPurchaseReversal,
  reversedByLoad,
  statusAfterReversal,
} from "./reversal-rules";
import { ORDER_STATUSES } from "./order-rules";
import { ROLES } from "./roles";

// Small seeded generator (mulberry32) so the random tests are repeatable.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (r: () => number, min: number, max: number) => min + Math.floor(r() * (max - min + 1));

const load = { bags: 100, ratePaise: 300_00, reversesDispatchId: null };
const base = {
  role: "admin",
  order: { status: "dispatched", bags: 100 },
  dispatch: load,
  reversedBags: 0,
  netSentBags: 100,
  bags: 100,
  reasonCode: "entry_mistake",
  note: "",
};

describe("statusAfterReversal", () => {
  it("follows the bags still sent; cancelled stays cancelled", () => {
    expect(statusAfterReversal("dispatched", 100, 0)).toBe("approved");
    expect(statusAfterReversal("dispatched", 100, 1)).toBe("partly_dispatched");
    expect(statusAfterReversal("partly_dispatched", 100, 99)).toBe("partly_dispatched");
    expect(statusAfterReversal("partly_dispatched", 100, 100)).toBe("dispatched");
    expect(statusAfterReversal("cancelled", 100, 0)).toBe("cancelled");
    expect(statusAfterReversal("cancelled", 100, 40)).toBe("cancelled");
  });
  it("only orders that can hold loads are reversible", () => {
    for (const s of ORDER_STATUSES) {
      const ok = ["partly_dispatched", "dispatched", "cancelled"].includes(s);
      expect(isReversibleOrderStatus(s)).toBe(ok);
      expect(statusAfterReversal(s, 10, 5) === null).toBe(!ok);
    }
  });
  it("bags left never go below 0", () => {
    expect(bagsLeftToReverse(10, 3)).toBe(7);
    expect(bagsLeftToReverse(10, 12)).toBe(0);
  });
});

describe("planDispatchReversal", () => {
  it("a full reversal credits bags x the load's rate and sends the order back to approved", () => {
    expect(planDispatchReversal(base)).toEqual({
      ok: true,
      code: "entry_mistake",
      note: "",
      creditPaise: -100 * 300_00,
      newStatus: "approved",
      reasonText: "Wrong entry",
    });
  });
  it("a part return keeps the rest sent", () => {
    const plan = planDispatchReversal({ ...base, bags: 30, reasonCode: "returned", note: "  wet  bags " });
    expect(plan).toMatchObject({ ok: true, creditPaise: -30 * 300_00, newStatus: "partly_dispatched", reasonText: "Returned · wet bags" });
  });
  it("every non-admin role is refused", () => {
    for (const role of [...ROLES.filter((r) => r !== "admin"), "", null, undefined, "user"]) {
      expect(planDispatchReversal({ ...base, role })).toEqual({ ok: false, error: "Only an admin can reverse a dispatch." });
    }
    expect(planDispatchReversal({ ...base, role: "sales,admin" }).ok).toBe(true);
  });
  it("refuses a reversal row, bad bags, over the load, and a missing reason", () => {
    expect(planDispatchReversal({ ...base, dispatch: { ...load, bags: -10, reversesDispatchId: "x" } })).toEqual({
      ok: false,
      error: "This row is already a reversal.",
    });
    for (const bags of [0, -1, 1.5, "10", null, Number.NaN]) {
      expect(planDispatchReversal({ ...base, bags })).toEqual({ ok: false, error: "Bags must be a whole number above zero." });
    }
    expect(planDispatchReversal({ ...base, reversedBags: 100, bags: 1 })).toEqual({ ok: false, error: "This load is already fully reversed." });
    expect(planDispatchReversal({ ...base, reversedBags: 70, bags: 31 })).toEqual({
      ok: false,
      error: "Only 30 bags of this load are left to reverse.",
    });
    expect(planDispatchReversal({ ...base, reasonCode: "" })).toEqual({ ok: false, error: "Pick a reason" });
    expect(planDispatchReversal({ ...base, reasonCode: "damage" })).toEqual({ ok: false, error: "Pick a reason" });
    expect(planDispatchReversal({ ...base, reasonCode: "other", note: " " })).toEqual({ ok: false, error: "Add a note" });
    expect(planDispatchReversal({ ...base, order: { status: "approved", bags: 100 } })).toEqual({
      ok: false,
      error: "This order has no loads to reverse.",
    });
  });

  it("property: random loads and part returns keep bags, credit and status exact; over-reversal is always refused", () => {
    const r = rng(20261024);
    for (let round = 0; round < 300; round++) {
      const ordered = int(r, 1, 500);
      const rate = int(r, 1, 900_00);
      // Random loads up to the ordered bags.
      const loads: { bags: number; reversed: number }[] = [];
      let sent = 0;
      while (sent < ordered && r() < 0.8) {
        const bags = int(r, 1, ordered - sent);
        loads.push({ bags, reversed: 0 });
        sent += bags;
      }
      if (loads.length === 0) continue;
      let status = sent === ordered ? "dispatched" : "partly_dispatched";
      if (status === "partly_dispatched" && r() < 0.2) status = "cancelled";
      let credit = 0;
      let reversedTotal = 0;
      for (let step = 0; step < 20; step++) {
        const l = loads[int(r, 0, loads.length - 1)];
        const left = l.bags - l.reversed;
        const bags = r() < 0.2 ? left + int(r, 1, 50) : int(r, 1, Math.max(1, left));
        const plan = planDispatchReversal({
          role: "admin",
          order: { status, bags: ordered },
          dispatch: { bags: l.bags, ratePaise: rate, reversesDispatchId: null },
          reversedBags: l.reversed,
          netSentBags: sent - reversedTotal,
          bags,
          reasonCode: "returned",
          note: "",
        });
        if (bags > left) {
          expect(plan.ok).toBe(false);
          continue;
        }
        if (!plan.ok) throw new Error(plan.error);
        l.reversed += bags;
        reversedTotal += bags;
        credit += plan.creditPaise;
        status = plan.newStatus;
        const net = loads.reduce((n, x) => n + x.bags, 0) - loads.reduce((n, x) => n + x.reversed, 0);
        expect(net).toBe(sent - reversedTotal);
        expect(credit).toBe(-reversedTotal * rate);
        expect(Number.isSafeInteger(credit)).toBe(true);
        expect(status).toBe(statusAfterReversal(status === "cancelled" ? "cancelled" : "dispatched", ordered, net));
      }
      for (const l of loads) expect(l.reversed).toBeLessThanOrEqual(l.bags);
    }
  });
});

describe("planPurchaseReversal", () => {
  const p = {
    role: "admin",
    purchase: { type: "purchase", bags: 200, receivedBags: 190, unitCostPaise: 250_00 },
    reversedBags: 0,
    stockAtPlace: 500,
    placeName: "Main godown",
    bags: 50,
    reasonCode: "entry_mistake",
    note: "",
  };
  it("credits the supplier bags x the invoice cost", () => {
    expect(planPurchaseReversal(p)).toEqual({ ok: true, code: "entry_mistake", note: "", supplierPaise: -50 * 250_00, reasonText: "Wrong entry" });
  });
  it("max is received bags (header) or the movement's bags, minus what was reversed", () => {
    expect(planPurchaseReversal({ ...p, bags: 191 })).toEqual({ ok: false, error: "Only 190 bags of this purchase are left to reverse." });
    expect(planPurchaseReversal({ ...p, bags: 190 }).ok).toBe(true);
    expect(planPurchaseReversal({ ...p, purchase: { ...p.purchase, receivedBags: null }, bags: 200 }).ok).toBe(true);
    expect(planPurchaseReversal({ ...p, reversedBags: 190, bags: 1 })).toEqual({ ok: false, error: "This purchase is already fully reversed." });
  });
  it("never more than the bags at the place now", () => {
    expect(planPurchaseReversal({ ...p, stockAtPlace: 20 })).toEqual({ ok: false, error: "Only 20 bags are at Main godown now." });
    expect(planPurchaseReversal({ ...p, stockAtPlace: -3 })).toEqual({ ok: false, error: "Only 0 bags are at Main godown now." });
  });
  it("refuses non-admins, non-purchases, a purchase without a cost, bad bags and a missing reason", () => {
    for (const role of [...ROLES.filter((r) => r !== "admin"), null]) {
      expect(planPurchaseReversal({ ...p, role })).toEqual({ ok: false, error: "Only an admin can reverse a purchase." });
    }
    expect(planPurchaseReversal({ ...p, purchase: { ...p.purchase, type: "opening" } })).toEqual({ ok: false, error: "This is not a purchase." });
    expect(planPurchaseReversal({ ...p, purchase: { ...p.purchase, unitCostPaise: null } })).toEqual({
      ok: false,
      error: "This purchase has no cost. Use a stock correction.",
    });
    expect(planPurchaseReversal({ ...p, bags: 0 }).ok).toBe(false);
    expect(planPurchaseReversal({ ...p, reasonCode: undefined })).toEqual({ ok: false, error: "Pick a reason" });
  });
  it("property: random part reversals never exceed what was received and the credit is exact", () => {
    const r = rng(7);
    for (let round = 0; round < 200; round++) {
      const billed = int(r, 1, 1000);
      const received = billed - int(r, 0, billed - 1);
      const cost = int(r, 1, 10_000_00);
      let reversed = 0;
      let credit = 0;
      for (let step = 0; step < 15; step++) {
        const bags = int(r, 1, received + 10);
        const plan = planPurchaseReversal({
          ...p,
          purchase: { type: "purchase", bags: billed, receivedBags: received, unitCostPaise: cost },
          reversedBags: reversed,
          stockAtPlace: 100_000,
          bags,
        });
        if (reversed + bags > received) {
          expect(plan.ok).toBe(false);
          continue;
        }
        if (!plan.ok) throw new Error(plan.error);
        reversed += bags;
        credit += plan.supplierPaise;
        expect(credit).toBe(-reversed * cost);
      }
      expect(reversed).toBeLessThanOrEqual(received);
    }
  });
});

describe("reversedByLoad", () => {
  it("adds up each load's reversal rows and ignores loads", () => {
    const m = reversedByLoad([
      { bags: 100, reversesDispatchId: null },
      { bags: -30, reversesDispatchId: "a" },
      { bags: -20, reversesDispatchId: "a" },
      { bags: -5, reversesDispatchId: "b" },
    ]);
    expect([...m]).toEqual([
      ["a", 50],
      ["b", 5],
    ]);
  });
});
