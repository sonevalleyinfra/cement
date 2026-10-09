import { describe, expect, it } from "vitest";
import {
  canAnswerRequest,
  canConfirmHandover,
  collectedMovements,
  pendingRequestIds,
  validateHandoverRequest,
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

describe("collectedMovements", () => {
  it("adds one row per firm line for cash only", () => {
    expect(collectedMovements("cash", [{ firmId: "A", amountPaise: 500 }, { firmId: "B", amountPaise: 0 }])).toEqual([
      { firmId: "A", kind: "collected", amountPaise: 500 },
    ]);
    expect(collectedMovements("online", [{ firmId: "A", amountPaise: 500 }])).toEqual([]);
  });
});
