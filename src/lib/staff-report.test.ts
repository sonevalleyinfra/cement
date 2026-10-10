import { describe, expect, it } from "vitest";
import { cashByPerson, onlineWaiting, paymentsByMode, staffActivity, type PaymentRow } from "./staff-report";

const names = new Map([
  ["s", "Ravi"],
  ["l", "Mohan"],
  ["a", "Asha"],
]);

describe("cashByPerson", () => {
  it("held = collected − reversed − confirmed; waiting handovers still held", () => {
    const rows = [
      { collectorId: "s", kind: "collected", amountPaise: 1_000_000 },
      { collectorId: "s", kind: "reversed", amountPaise: 200_000 },
      { collectorId: "s", id: "h1", kind: "handover_request", amountPaise: 600_000 },
      { collectorId: "s", kind: "handover_confirmed", amountPaise: 600_000, refId: "h1" },
      { collectorId: "l", kind: "collected", amountPaise: 500_000 },
      { collectorId: "l", id: "h2", kind: "handover_request", amountPaise: 500_000 },
      { collectorId: "a", kind: "collected", amountPaise: 100 },
      { collectorId: "a", id: "h3", kind: "handover_request", amountPaise: 100 },
      { collectorId: "a", kind: "handover_confirmed", amountPaise: 100, refId: "h3" },
    ];
    expect(cashByPerson(rows, names)).toEqual([
      { personId: "l", name: "Mohan", heldPaise: 500_000, waitingPaise: 500_000 },
      { personId: "s", name: "Ravi", heldPaise: 200_000, waitingPaise: 0 },
    ]);
  });

  it("no data", () => expect(cashByPerson([], names)).toEqual([]));
});

const pay = (over: Partial<PaymentRow>): PaymentRow => ({
  mode: "cash",
  status: "received",
  totalPaise: 1000,
  createdAt: "2026-10-05T06:00:00Z",
  receivedBy: "s",
  ...over,
});

describe("onlineWaiting", () => {
  it("count, amount and the oldest one's age in India days", () => {
    const now = new Date("2026-10-10T19:00:00Z"); // 11 Oct, 00:30 IST
    const w = onlineWaiting(
      [
        pay({ mode: "online", status: "unverified", totalPaise: 700, createdAt: "2026-10-01T18:31:00Z" }), // 2 Oct IST
        pay({ mode: "online", status: "unverified", totalPaise: 300, createdAt: "2026-10-09T00:00:00Z" }),
        pay({ mode: "online", status: "verified", totalPaise: 999 }),
        pay({}),
      ],
      now,
    );
    expect(w).toEqual({ count: 2, amountPaise: 1000, oldestDays: 9 });
  });

  it("none waiting", () => expect(onlineWaiting([pay({})], new Date())).toEqual({ count: 0, amountPaise: 0, oldestDays: null }));
});

describe("paymentsByMode", () => {
  it("splits by mode and state; reversed and rejected stay out of the total", () => {
    const p = paymentsByMode([
      pay({ totalPaise: 1000 }),
      pay({ totalPaise: 500, status: "reversed" }),
      pay({ mode: "online", status: "verified", totalPaise: 4000 }),
      pay({ mode: "online", status: "unverified", totalPaise: 700 }),
      pay({ mode: "online", status: "rejected", totalPaise: 300 }),
    ]);
    expect(p).toEqual({
      cash: { count: 1, paise: 1000 },
      onlineVerified: { count: 1, paise: 4000 },
      onlineWaiting: { count: 1, paise: 700 },
      total: { count: 3, paise: 5700 },
      reversed: { count: 1, paise: 500 },
      rejected: { count: 1, paise: 300 },
    });
  });
});

describe("staffActivity", () => {
  it("counts per person and adds cash held now", () => {
    const lines = staffActivity(
      {
        orders: [{ placedBy: "s" }, { placedBy: "s" }],
        decisions: [
          { actorId: "a", toStatus: "approved" },
          { actorId: "a", toStatus: "rejected" },
          { actorId: "a", toStatus: "cancelled" },
        ],
        dispatches: [
          { dispatchedBy: "l", bags: 30 },
          { dispatchedBy: "l", bags: 20 },
        ],
        payments: [
          { receivedBy: "s", status: "received", totalPaise: 1000 },
          { receivedBy: "s", status: "reversed", totalPaise: 500 },
          { receivedBy: "l", status: "unverified", totalPaise: 700 },
        ],
        cash: [{ personId: "s", name: "Ravi", heldPaise: 1000, waitingPaise: 0 }],
      },
      names,
    );
    expect(lines.map((l) => [l.name, l.ordersPlaced, l.approved, l.rejected, l.dispatches, l.dispatchedBags, l.payments, l.paymentsPaise, l.cashHeldPaise])).toEqual([
      ["Asha", 0, 1, 1, 0, 0, 0, 0, 0],
      ["Mohan", 0, 0, 0, 2, 50, 1, 700, 0],
      ["Ravi", 2, 0, 0, 0, 0, 1, 1000, 1000],
    ]);
  });

  it("no data", () => {
    expect(staffActivity({ orders: [], decisions: [], dispatches: [], payments: [], cash: [] }, names)).toEqual([]);
  });
});
