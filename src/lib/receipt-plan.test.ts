import { describe, expect, it } from "vitest";
import { planReceipt, type ReceiptRequest } from "./receipt-plan";

const items = [
  { orderId: "o1", firmId: "A", retailerId: "R", dueSinceDate: "2026-10-01", duePaise: 6000000 },
  { orderId: "o2", firmId: "B", retailerId: "R", dueSinceDate: "2026-10-02", duePaise: 7000000 },
];
const base: ReceiptRequest = {
  retailerId: "R",
  mode: "cash",
  totalPaise: 10000000,
  details: {},
  allocations: [
    { orderId: "o1", firmId: "A", amountPaise: 6000000 },
    { orderId: "o2", firmId: "B", amountPaise: 4000000 },
  ],
  advance: null,
};

describe("planReceipt status", () => {
  it("online starts unverified", () => {
    const p = planReceipt(
      { ...base, mode: "online", details: { utr: "U1", receivedFirmId: "A" } },
      items,
    );
    expect(p.ok && p.status).toBe("unverified");
  });
});

describe("planReceipt", () => {
  it("posts one negative credit per firm", () => {
    const p = planReceipt(base, items);
    expect(p.ok && p.ledger.map((l) => [l.firmId, l.amountPaise, l.kind])).toEqual([
      ["A", -6000000, "receipt_credit"],
      ["B", -4000000, "receipt_credit"],
    ]);
    expect(p.ok && p.status).toBe("received");
  });
  it("refuses when remaining is not zero", () => {
    expect(planReceipt({ ...base, totalPaise: 10000001 }, items).ok).toBe(false);
  });
  it("stores the excess as an advance row and credits that firm", () => {
    const p = planReceipt(
      { ...base, totalPaise: 10500000, advance: { firmId: "A", amountPaise: 500000 } },
      items,
    );
    expect(p.ok && p.rows.at(-1)).toEqual({ firmId: "A", orderId: null, amountPaise: 500000, advance: true });
    expect(p.ok && p.ledger.find((l) => l.firmId === "A")?.amountPaise).toBe(-6500000);
  });
  it("cheque is pending but still credits, and needs its details", () => {
    expect(planReceipt({ ...base, mode: "cheque" }, items).ok).toBe(false);
    const p = planReceipt(
      {
        ...base,
        mode: "cheque",
        details: { chequeNumber: "1", chequeDate: "2026-10-09", bankName: "SBI", receivedFirmId: "A" },
      },
      items,
    );
    expect(p.ok && p.status).toBe("pending");
    expect(p.ok && p.ledger.length).toBe(2);
  });
  it("refuses an order that belongs to another retailer's list", () => {
    expect(planReceipt({ ...base, retailerId: "X" }, items).ok).toBe(false);
  });
});
