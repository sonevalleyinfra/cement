import { describe, expect, it } from "vitest";
import { RECEIPT_STATUSES } from "./receipt-rules";
import { canReverseReceipt, isReversibleStatus, planReversal } from "./receipt-reversal";
import { walletBalance } from "./wallet-rules";

const cash = { mode: "cash", status: "received", receiptNo: 12, totalPaise: 10000 };
const holds = (balancePaise: number, availablePaise = balancePaise) => ({ balancePaise, availablePaise });

describe("reversible statuses", () => {
  it("received (cash) and verified (online) only", () => {
    expect(RECEIPT_STATUSES.filter((s) => isReversibleStatus(s))).toEqual(["received", "verified"]);
  });
  it("only accounts and admin may reverse", () => {
    expect(canReverseReceipt("accounts", "received")).toBe(true);
    expect(canReverseReceipt("admin", "verified")).toBe(true);
    for (const role of ["sales", "logistics", "retailer", null]) expect(canReverseReceipt(role, "received")).toBe(false);
    for (const status of ["unverified", "rejected", "reversed"]) expect(canReverseReceipt("accounts", status)).toBe(false);
  });
});

describe("planReversal", () => {
  it("cash still held: one +ledger amount and the same cash out of the holder's balance", () => {
    expect(planReversal("accounts", cash, " typo ", holds(10000))).toEqual({
      ok: true,
      reason: "typo",
      ledgerPaise: 10000,
      walletPaise: 10000,
      note: "Payment #12 reversed: typo",
    });
  });
  it("undoes the original credit exactly", () => {
    const p = planReversal("accounts", cash, "x", holds(10000));
    expect(p.ok && -cash.totalPaise + p.ledgerPaise).toBe(0);
  });
  it("needs a reason", () => {
    expect(planReversal("accounts", cash, "  ", holds(10000))).toMatchObject({ ok: false, error: "Enter the reason." });
  });
  it("cash already handed over is refused, pointing to a ledger adjustment", () => {
    const p = planReversal("accounts", cash, "x", holds(9999));
    expect(p).toMatchObject({ ok: false, error: expect.stringMatching(/already handed over.*ledger adjustment/) });
    expect(planReversal("accounts", cash, "x").ok).toBe(false);
  });
  it("cash promised in a waiting handover request is refused until the request is answered", () => {
    const moves = [
      { id: "c", kind: "collected", amountPaise: 10000 },
      { id: "r", kind: "handover_request", amountPaise: 1000 },
    ];
    const p = planReversal("accounts", cash, "x", walletBalance(moves));
    expect(p).toMatchObject({ ok: false, error: expect.stringMatching(/handover .* waiting/) });
  });
  it("after the reversal the holder has that much less", () => {
    const p = planReversal("accounts", cash, "x", holds(10000));
    const after = walletBalance([
      { kind: "collected", amountPaise: 10000 },
      ...(p.ok ? [{ kind: "reversed", amountPaise: p.walletPaise }] : []),
    ]);
    expect(after.balancePaise).toBe(0);
  });
  it("verified online: ledger only, no cash", () => {
    const p = planReversal("admin", { mode: "online", status: "verified", receiptNo: 1, totalPaise: 10000 }, "x");
    expect(p).toMatchObject({ ok: true, ledgerPaise: 10000, walletPaise: 0 });
  });
  it("unverified online is rejected, not reversed", () => {
    const p = planReversal("accounts", { mode: "online", status: "unverified", receiptNo: 1, totalPaise: 10000 }, "x");
    expect(p).toMatchObject({ ok: false, error: expect.stringMatching(/Reject/) });
  });
  it("rejected and reversed are final; sales cannot reverse", () => {
    expect(planReversal("accounts", { ...cash, status: "reversed" }, "x", holds(10000)).ok).toBe(false);
    expect(planReversal("accounts", { ...cash, mode: "online", status: "rejected" }, "x").ok).toBe(false);
    expect(planReversal("sales", cash, "x", holds(10000)).ok).toBe(false);
  });
});
