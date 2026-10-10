import { describe, expect, it } from "vitest";
import {
  canAnswerRequest,
  canConfirmHandover,
  pendingRequestIds,
  validateHandoverRequest,
  WALLET_KINDS,
  walletBalance,
} from "./wallet-rules";

const moves = [
  { id: "1", kind: "collected", amountPaise: 100000 },
  { id: "2", kind: "collected", amountPaise: 50000 },
  { id: "3", kind: "handover_request", amountPaise: 60000 },
  { id: "4", kind: "handover_confirmed", amountPaise: 60000, refId: "3" },
  { id: "5", kind: "handover_request", amountPaise: 30000 },
];

describe("walletBalance", () => {
  it("is collected minus confirmed handovers; pending is held back", () => {
    expect(walletBalance(moves)).toEqual({
      collectedPaise: 150000,
      reversedPaise: 0,
      handedOverPaise: 60000,
      pendingPaise: 30000,
      balancePaise: 90000,
      availablePaise: 60000,
    });
  });
  it("a rejected request frees the cash again", () => {
    const b = walletBalance([...moves, { id: "6", kind: "handover_rejected", amountPaise: 0, refId: "5" }]);
    expect(b.pendingPaise).toBe(0);
    expect(b.availablePaise).toBe(90000);
  });
  it("a reversed cash receipt takes its cash back out of the wallet", () => {
    const b = walletBalance([...moves, { id: "6", kind: "reversed", amountPaise: 40000 }]);
    expect(b.reversedPaise).toBe(40000);
    expect(b.collectedPaise).toBe(150000);
    expect(b.balancePaise).toBe(50000); // 150000 - 40000 - 60000
    expect(b.availablePaise).toBe(20000); // minus the 30000 still pending
  });
  it("a reversal is not mistaken for a handover", () => {
    const b = walletBalance([{ id: "1", kind: "collected", amountPaise: 500 }, { id: "2", kind: "reversed", amountPaise: 500 }]);
    expect(b.handedOverPaise).toBe(0);
    expect(b.pendingPaise).toBe(0);
    expect(b.balancePaise).toBe(0);
  });
  it("lists every kind, including reversed", () => {
    expect(WALLET_KINDS).toEqual(["collected", "handover_request", "handover_confirmed", "handover_rejected", "reversed"]);
  });
  it("empty wallet is zero", () => {
    expect(walletBalance([]).balancePaise).toBe(0);
  });
});

describe("pendingRequestIds", () => {
  it("lists only unanswered requests", () => expect(pendingRequestIds(moves)).toEqual(["5"]));
});

describe("validateHandoverRequest", () => {
  it("accepts up to the available cash", () => {
    expect(validateHandoverRequest(60000, 60000).ok).toBe(true);
    expect(validateHandoverRequest(60001, 60000).ok).toBe(false);
  });
  it("refuses zero, negative and fractional paise", () => {
    expect(validateHandoverRequest(0, 100).ok).toBe(false);
    expect(validateHandoverRequest(-5, 100).ok).toBe(false);
    expect(validateHandoverRequest(1.5, 100).ok).toBe(false);
  });
});

describe("canConfirmHandover", () => {
  it("lets accounts and admin confirm someone else's handover", () => {
    expect(canConfirmHandover("accounts", "a", "c").ok).toBe(true);
    expect(canConfirmHandover("admin", "a", "c").ok).toBe(true);
  });
  it("refuses sales and self-confirmation", () => {
    expect(canConfirmHandover("sales", "a", "c").ok).toBe(false);
    expect(canConfirmHandover("accounts", "c", "c").ok).toBe(false);
  });
  it("answers a request only once", () => {
    expect(canAnswerRequest(false).ok).toBe(true);
    expect(canAnswerRequest(true).ok).toBe(false);
  });
});
