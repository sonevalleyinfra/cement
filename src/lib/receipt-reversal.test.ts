import { describe, expect, it } from "vitest";
import { RECEIPT_STATUSES } from "./receipt-rules";
import { canReverseReceipt, checkReversalReason, isReversibleStatus, planReversal } from "./receipt-reversal";
import { walletBalance } from "./wallet-rules";

const cash = { mode: "cash", status: "received", receiptNo: 12, totalPaise: 10000 };

describe("reversible statuses", () => {
  it("received, unverified, verified and cleared only", () => {
    const yes = RECEIPT_STATUSES.filter((s) => isReversibleStatus(s));
    expect(yes).toEqual(["received", "unverified", "verified", "cleared"]);
  });
  it("only accounts and admin may reverse", () => {
    expect(canReverseReceipt("accounts", "received")).toBe(true);
    expect(canReverseReceipt("admin", "verified")).toBe(true);
    for (const role of ["sales", "logistics", "retailer", null]) expect(canReverseReceipt(role, "received")).toBe(false);
    expect(canReverseReceipt("accounts", "pending")).toBe(false);
    expect(canReverseReceipt("accounts", "reversed")).toBe(false);
  });
});

describe("checkReversalReason", () => {
  it("trims and requires a reason up to 300 characters", () => {
    expect(checkReversalReason("  wrong shop ")).toEqual({ ok: true, reason: "wrong shop" });
    expect(checkReversalReason("   ").ok).toBe(false);
    expect(checkReversalReason(undefined).ok).toBe(false);
    expect(checkReversalReason("x".repeat(300)).ok).toBe(true);
    expect(checkReversalReason("x".repeat(301)).ok).toBe(false);
  });
});

describe("planReversal", () => {
  it("cash: one +ledger amount and the same cash out of the wallet", () => {
    expect(planReversal("accounts", cash, " typo ", 10000)).toEqual({
      ok: true,
      reason: "typo",
      ledgerPaise: 10000,
      walletPaise: 10000,
      note: "Receipt #12 reversed: typo",
    });
  });
  it("undoes the original credit exactly", () => {
    const p = planReversal("accounts", cash, "x", 10000);
    expect(p.ok && -cash.totalPaise + p.ledgerPaise).toBe(0);
  });
  it("cash already handed over is refused", () => {
    const p = planReversal("accounts", cash, "x", 9999);
    expect(p).toMatchObject({ ok: false, error: expect.stringMatching(/already handed over/) });
    expect(planReversal("accounts", cash, "x").ok).toBe(false);
  });
  it("uses AVAILABLE cash: a pending handover blocks it", () => {
    const moves = [
      { id: "c", kind: "collected", amountPaise: 10000 },
      { id: "r", kind: "handover_request", amountPaise: 1000 },
    ];
    expect(planReversal("accounts", cash, "x", walletBalance(moves).availablePaise).ok).toBe(false);
  });
  it("after the reversal the wallet holds that much less", () => {
    const p = planReversal("accounts", cash, "x", 10000);
    const after = walletBalance([
      { kind: "collected", amountPaise: 10000 },
      ...(p.ok ? [{ kind: "reversed", amountPaise: p.walletPaise }] : []),
    ]);
    expect(after.balancePaise).toBe(0);
  });
  it("online and cleared cheque: ledger only, no wallet", () => {
    for (const r of [
      { mode: "online", status: "unverified", receiptNo: 1, totalPaise: 10000 },
      { mode: "online", status: "verified", receiptNo: 1, totalPaise: 10000 },
      { mode: "cheque", status: "cleared", receiptNo: 1, totalPaise: 10000 },
    ]) {
      const p = planReversal("accounts", r, "not received");
      expect(p.ok && p.walletPaise).toBe(0);
      expect(p.ok && p.ledgerPaise).toBe(10000);
    }
  });
  it("refuses wrong role, final or pending status, no reason, nothing to reverse", () => {
    expect(planReversal("sales", cash, "x", 10000).ok).toBe(false);
    expect(planReversal("accounts", { ...cash, mode: "cheque", status: "pending" }, "x")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/bounced/),
    });
    expect(planReversal("accounts", { ...cash, status: "reversed" }, "x", 10000).ok).toBe(false);
    expect(planReversal("accounts", { ...cash, status: "bounced" }, "x", 10000).ok).toBe(false);
    expect(planReversal("accounts", cash, " ", 10000).ok).toBe(false);
    expect(planReversal("accounts", { ...cash, totalPaise: 0 }, "x", 10000).ok).toBe(false);
  });
});
