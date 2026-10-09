import { describe, expect, it } from "vitest";
import { RECEIPT_STATUSES } from "./receipt-rules";
import { canReverseReceipt, checkReversalReason, isReversibleStatus, planReversal } from "./receipt-reversal";
import { walletBalance } from "./wallet-rules";

const lines = [
  { firmId: "A", amountPaise: 6000 },
  { firmId: "B", amountPaise: 4000 },
];
const cash = { mode: "cash", status: "received", receiptNo: 12 };
const enough = { A: 6000, B: 4000 };

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
  it("cash: one +ledger row and one wallet 'reversed' row per firm", () => {
    const p = planReversal("accounts", cash, lines, " typo ", enough);
    expect(p).toEqual({
      ok: true,
      reason: "typo",
      ledger: lines,
      wallet: [
        { firmId: "A", kind: "reversed", amountPaise: 6000 },
        { firmId: "B", kind: "reversed", amountPaise: 4000 },
      ],
      note: "Receipt #12 reversed: typo",
    });
  });
  it("undoes the original credit exactly", () => {
    const p = planReversal("accounts", cash, lines, "x", enough);
    const credits = lines.map((l) => -l.amountPaise);
    expect(p.ok && [...credits, ...p.ledger.map((l) => l.amountPaise)].reduce((s, n) => s + n, 0)).toBe(0);
  });
  it("cash already handed over (any firm short) is refused", () => {
    const p = planReversal("accounts", cash, lines, "x", { A: 6000, B: 3999 });
    expect(p).toMatchObject({ ok: false, error: expect.stringMatching(/already handed over/) });
    expect(planReversal("accounts", cash, lines, "x", {}).ok).toBe(false);
  });
  it("uses AVAILABLE cash: a pending handover blocks it", () => {
    const moves = [
      { id: "c", kind: "collected", amountPaise: 6000 },
      { id: "r", kind: "handover_request", amountPaise: 1000 },
    ];
    const available = walletBalance(moves).availablePaise;
    expect(planReversal("accounts", cash, [lines[0]], "x", { A: available }).ok).toBe(false);
  });
  it("after the reversal the wallet holds that much less", () => {
    const p = planReversal("accounts", cash, [lines[0]], "x", enough);
    const after = walletBalance([
      { kind: "collected", amountPaise: 6000 },
      ...(p.ok ? p.wallet : []),
    ]);
    expect(after.balancePaise).toBe(0);
  });
  it("online and cleared cheque: ledger only, no wallet", () => {
    for (const r of [
      { mode: "online", status: "unverified", receiptNo: 1 },
      { mode: "online", status: "verified", receiptNo: 1 },
      { mode: "cheque", status: "cleared", receiptNo: 1 },
    ]) {
      const p = planReversal("accounts", r, lines, "not received");
      expect(p.ok && p.wallet).toEqual([]);
      expect(p.ok && p.ledger).toEqual(lines);
    }
  });
  it("refuses wrong role, final or pending status, no reason, nothing to reverse", () => {
    expect(planReversal("sales", cash, lines, "x", enough).ok).toBe(false);
    expect(planReversal("accounts", { ...cash, mode: "cheque", status: "pending" }, lines, "x")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/bounced/),
    });
    expect(planReversal("accounts", { ...cash, status: "reversed" }, lines, "x", enough).ok).toBe(false);
    expect(planReversal("accounts", { ...cash, status: "bounced" }, lines, "x", enough).ok).toBe(false);
    expect(planReversal("accounts", cash, lines, " ", enough).ok).toBe(false);
    expect(planReversal("accounts", cash, [], "x", enough).ok).toBe(false);
  });
});
