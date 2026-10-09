import { describe, expect, it } from "vitest";
import { planReceipt, type ReceiptRequest } from "./receipt-plan";
import type { FirmDue } from "./receipt-rules";

const dues: FirmDue[] = [
  { firmId: "A", duePaise: 6000000, items: [{ kind: "order", dueSince: "2026-10-01T06:00:00Z", duePaise: 6000000 }] },
  { firmId: "B", duePaise: 7000000, items: [{ kind: "opening", dueSince: "2026-10-02T06:00:00Z", duePaise: 7000000 }] },
];
const base: ReceiptRequest = {
  retailerId: "R",
  mode: "cash",
  totalPaise: 10000000,
  details: {},
  allocations: [
    { firmId: "A", amountPaise: 6000000 },
    { firmId: "B", amountPaise: 4000000 },
  ],
  advance: null,
};

describe("planReceipt status", () => {
  it("cash is received, online starts unverified", () => {
    expect(planReceipt(base, dues)).toMatchObject({ ok: true, status: "received" });
    const p = planReceipt({ ...base, mode: "online", details: { utr: "U1", receivedFirmId: "A" } }, dues);
    expect(p.ok && p.status).toBe("unverified");
  });
});

describe("planReceipt", () => {
  it("one allocation row per firm, no order, and one negative credit per firm", () => {
    const p = planReceipt(base, dues);
    expect(p.ok && p.rows).toEqual([
      { firmId: "A", orderId: null, amountPaise: 6000000, advance: false },
      { firmId: "B", orderId: null, amountPaise: 4000000, advance: false },
    ]);
    expect(p.ok && p.ledger.map((l) => [l.firmId, l.amountPaise, l.kind, l.retailerId])).toEqual([
      ["A", -6000000, "receipt_credit", "R"],
      ["B", -4000000, "receipt_credit", "R"],
    ]);
  });
  it("refuses when remaining is not zero", () => {
    expect(planReceipt({ ...base, totalPaise: 10000001 }, dues).ok).toBe(false);
  });
  it("refuses more than a firm's dues (server-side dues win)", () => {
    const p = planReceipt(
      { ...base, totalPaise: 7000000, allocations: [{ firmId: "A", amountPaise: 7000000 }] },
      dues,
    );
    expect(p.ok).toBe(false);
  });
  it("stores the excess as an advance row and credits that firm once", () => {
    const p = planReceipt({ ...base, totalPaise: 10500000, advance: { firmId: "A", amountPaise: 500000 } }, dues);
    expect(p.ok && p.rows.at(-1)).toEqual({ firmId: "A", orderId: null, amountPaise: 500000, advance: true });
    expect(p.ok && p.ledger.filter((l) => l.firmId === "A").map((l) => l.amountPaise)).toEqual([-6500000]);
    expect(p.ok && p.lines).toEqual([
      { firmId: "A", amountPaise: 6500000 },
      { firmId: "B", amountPaise: 4000000 },
    ]);
  });
  it("all advance when there are no dues", () => {
    const p = planReceipt({ ...base, totalPaise: 500, allocations: [], advance: { firmId: "C", amountPaise: 500 } }, []);
    expect(p.ok && p.rows).toEqual([{ firmId: "C", orderId: null, amountPaise: 500, advance: true }]);
  });
  it("cheque is pending but still credits, and needs its details", () => {
    expect(planReceipt({ ...base, mode: "cheque" }, dues).ok).toBe(false);
    const p = planReceipt(
      {
        ...base,
        mode: "cheque",
        details: { chequeNumber: "1", chequeDate: "2026-10-09", bankName: "SBI", receivedFirmId: "A" },
      },
      dues,
    );
    expect(p.ok && p.status).toBe("pending");
    expect(p.ok && p.ledger.length).toBe(2);
  });
});
