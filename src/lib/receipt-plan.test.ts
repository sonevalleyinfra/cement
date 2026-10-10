import { describe, expect, it } from "vitest";
import { planReceipt, type ReceiptRequest } from "./receipt-plan";

const base: ReceiptRequest = { retailerId: "R", mode: "cash", totalPaise: 10000000, details: {} };

describe("planReceipt status", () => {
  it("cash is received, online starts unverified", () => {
    expect(planReceipt(base)).toMatchObject({ ok: true, status: "received" });
    const p = planReceipt({ ...base, mode: "online", details: { utr: "U1" } });
    expect(p.ok && p.status).toBe("unverified");
  });
});

describe("planReceipt", () => {
  it("credits the retailer's ledger with one negative row for the whole amount", () => {
    expect(planReceipt(base)).toEqual({
      ok: true,
      status: "received",
      ledger: { retailerId: "R", kind: "receipt_credit", amountPaise: -10000000 },
      walletPaise: 10000000,
    });
  });
  it("only cash goes into the wallet", () => {
    const p = planReceipt({ ...base, mode: "online", details: { utr: "U1" } });
    expect(p.ok && p.walletPaise).toBe(0);
  });
  it("refuses a bad amount", () => {
    for (const totalPaise of [0, -5, 1.5]) expect(planReceipt({ ...base, totalPaise }).ok).toBe(false);
  });
  it("cheque is pending but still credits, and needs its details", () => {
    expect(planReceipt({ ...base, mode: "cheque" }).ok).toBe(false);
    const p = planReceipt({
      ...base,
      mode: "cheque",
      details: { chequeNumber: "1", chequeDate: "2026-10-09", bankName: "SBI" },
    });
    expect(p.ok && p.status).toBe("pending");
    expect(p.ok && p.ledger.amountPaise).toBe(-10000000);
    expect(p.ok && p.walletPaise).toBe(0);
  });
  it("refuses an unknown mode", () => expect(planReceipt({ ...base, mode: "upi" }).ok).toBe(false));
});
