import { describe, expect, it } from "vitest";
import { ROLES } from "./roles";
import {
  ALLOWED_TRANSITIONS,
  ORDER_STATUSES,
  canTransition,
  canUserTransition,
  cancelDecision,
  checkDispatchBags,
  isFinalStatus,
  isOrderStatus,
  isValidBags,
  isValidRatePaise,
  isValidReason,
  orderTotalPaise,
  pickNextAssignee,
  remainingBags,
  rolesForTransition,
  statusAfterDispatch,
} from "./order-rules";

describe("transitions", () => {
  for (const from of ORDER_STATUSES) {
    for (const to of ORDER_STATUSES) {
      const valid = ALLOWED_TRANSITIONS[from].includes(to);
      it(`${from} -> ${to} is ${valid ? "allowed" : "refused"}`, () => {
        expect(canTransition(from, to)).toBe(valid);
      });
    }
  }
  it("follows the spec flow", () => {
    const path = ["placed", "rate_filled", "approved", "assigned", "dispatched", "delivered"] as const;
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i], path[i + 1])).toBe(true);
  });
  it("allows split dispatches", () => {
    expect(canTransition("assigned", "partly_dispatched")).toBe(true);
    expect(canTransition("partly_dispatched", "partly_dispatched")).toBe(true);
    expect(canTransition("partly_dispatched", "dispatched")).toBe(true);
  });
  it("rejected, delivered and cancelled are final", () => {
    for (const s of ["rejected", "delivered", "cancelled"] as const) expect(isFinalStatus(s)).toBe(true);
    expect(isFinalStatus("placed")).toBe(false);
  });
  it("cannot skip approval or go backwards", () => {
    expect(canTransition("placed", "approved")).toBe(false);
    expect(canTransition("approved", "rate_filled")).toBe(false);
    expect(canTransition("dispatched", "cancelled")).toBe(false);
  });
  it("knows statuses", () => {
    expect(isOrderStatus("approved")).toBe(true);
    expect(isOrderStatus("nope")).toBe(false);
  });
});

describe("roles per transition", () => {
  const cases: [Parameters<typeof canTransition>[0], Parameters<typeof canTransition>[1], string][] = [
    ["placed", "rate_filled", "sales"],
    ["rate_filled", "approved", "accounts"],
    ["rate_filled", "rejected", "accounts"],
    ["approved", "assigned", "accounts"],
    ["assigned", "partly_dispatched", "logistics"],
    ["assigned", "dispatched", "logistics"],
    ["partly_dispatched", "dispatched", "logistics"],
    ["dispatched", "delivered", "logistics"],
    ["placed", "cancelled", "sales"],
    ["rate_filled", "cancelled", "sales"],
    ["approved", "cancelled", "accounts"],
    ["assigned", "cancelled", "accounts"],
    ["partly_dispatched", "cancelled", "accounts"],
  ];
  for (const [from, to, owner] of cases) {
    for (const role of ROLES) {
      const expected = role === "admin" || role === owner;
      it(`${role} ${expected ? "can" : "cannot"} move ${from} -> ${to}`, () => {
        expect(canUserTransition(role, from, to)).toBe(expected);
      });
    }
  }
  it("retailer can never move an order", () => {
    for (const from of ORDER_STATUSES)
      for (const to of ORDER_STATUSES) expect(canUserTransition("retailer", from, to)).toBe(false);
  });
  it("nobody can make an invalid move, even admin", () => {
    expect(canUserTransition("admin", "placed", "delivered")).toBe(false);
    expect(rolesForTransition("delivered", "placed")).toEqual([]);
  });
  it("handles multiple and missing roles", () => {
    expect(canUserTransition("sales,accounts", "rate_filled", "approved")).toBe(true);
    expect(canUserTransition(null, "placed", "rate_filled")).toBe(false);
  });
});

describe("cancelDecision", () => {
  it("before approval needs no stock reversal", () => {
    expect(cancelDecision("placed", 0, "wrong firm")).toEqual({ ok: true, reverseStockBags: 0 });
    expect(cancelDecision("rate_filled", 0, "x")).toEqual({ ok: true, reverseStockBags: 0 });
  });
  it("approved/assigned with nothing dispatched reverses nothing", () => {
    expect(cancelDecision("approved", 0, "x")).toEqual({ ok: true, reverseStockBags: 0 });
    expect(cancelDecision("assigned", 0, "x")).toEqual({ ok: true, reverseStockBags: 0 });
  });
  it("partly dispatched reverses the dispatched bags", () => {
    expect(cancelDecision("partly_dispatched", 40, "x")).toEqual({ ok: true, reverseStockBags: 40 });
  });
  it("ignores a negative bag count", () => {
    expect(cancelDecision("partly_dispatched", -5, "x")).toEqual({ ok: true, reverseStockBags: 0 });
  });
  it("refuses final or fully dispatched orders", () => {
    for (const s of ["dispatched", "delivered", "rejected", "cancelled"] as const) {
      expect(cancelDecision(s, 10, "x").ok).toBe(false);
    }
  });
  it("needs a reason", () => {
    expect(cancelDecision("approved", 0, "  ").ok).toBe(false);
    expect(cancelDecision("approved", 0, null).ok).toBe(false);
  });
});

describe("reason and rate", () => {
  it("reason", () => {
    expect(isValidReason("too much due")).toBe(true);
    expect(isValidReason("   ")).toBe(false);
    expect(isValidReason(undefined)).toBe(false);
  });
  it("rate is a positive integer in paise", () => {
    expect(isValidRatePaise(38000)).toBe(true);
    expect(isValidRatePaise(0)).toBe(false);
    expect(isValidRatePaise(-1)).toBe(false);
    expect(isValidRatePaise(380.5)).toBe(false);
    expect(isValidRatePaise(Number.NaN)).toBe(false);
  });
  it("total is bags x rate in paise", () => {
    expect(orderTotalPaise(100, 38050)).toBe(3805000);
  });
});

describe("bag quantities", () => {
  it("valid bags are positive integers", () => {
    expect(isValidBags(1)).toBe(true);
    expect(isValidBags(0)).toBe(false);
    expect(isValidBags(-3)).toBe(false);
    expect(isValidBags(2.5)).toBe(false);
    expect(isValidBags(Number.NaN)).toBe(false);
  });
  it("remaining bags", () => {
    expect(remainingBags(100, 30)).toBe(70);
    expect(remainingBags(100, 100)).toBe(0);
    expect(remainingBags(100, 120)).toBe(0);
  });
  it("dispatch check", () => {
    expect(checkDispatchBags(100, 30, 70)).toEqual({ ok: true, remainingAfter: 0 });
    expect(checkDispatchBags(100, 30, 20)).toEqual({ ok: true, remainingAfter: 50 });
    expect(checkDispatchBags(100, 30, 71).ok).toBe(false);
    expect(checkDispatchBags(100, 100, 1).ok).toBe(false);
    expect(checkDispatchBags(100, 0, 0).ok).toBe(false);
    expect(checkDispatchBags(100, 0, 1.5).ok).toBe(false);
  });
  it("status after dispatch", () => {
    expect(statusAfterDispatch(100, 40)).toBe("partly_dispatched");
    expect(statusAfterDispatch(100, 100)).toBe("dispatched");
  });
});

describe("pickNextAssignee", () => {
  const list = [
    { id: "a", active: true },
    { id: "b", active: true },
    { id: "c", active: true },
  ];
  it("empty list gives null", () => expect(pickNextAssignee([], "a")).toBeNull());
  it("starts at the first when nobody was assigned yet", () => {
    expect(pickNextAssignee(list, null)).toBe("a");
    expect(pickNextAssignee(list, undefined)).toBe("a");
  });
  it("moves to the next", () => {
    expect(pickNextAssignee(list, "a")).toBe("b");
    expect(pickNextAssignee(list, "b")).toBe("c");
  });
  it("wraps around", () => expect(pickNextAssignee(list, "c")).toBe("a"));
  it("skips inactive people", () => {
    const l = [list[0], { id: "b", active: false }, list[2]];
    expect(pickNextAssignee(l, "a")).toBe("c");
  });
  it("skips inactive across the wraparound", () => {
    const l = [{ id: "a", active: false }, list[1], { id: "c", active: false }];
    expect(pickNextAssignee(l, "b")).toBe("b");
    expect(pickNextAssignee(l, "c")).toBe("b");
  });
  it("returns null when nobody is active", () => {
    expect(pickNextAssignee(list.map((c) => ({ ...c, active: false })), "a")).toBeNull();
  });
  it("starts from the first if the last one is gone", () => {
    expect(pickNextAssignee(list, "zzz")).toBe("a");
  });
  it("works with a single active person", () => {
    expect(pickNextAssignee([{ id: "a", active: true }], "a")).toBe("a");
  });
  it("last assigned inactive still moves on", () => {
    const l = [{ id: "a", active: false }, list[1], list[2]];
    expect(pickNextAssignee(l, "a")).toBe("b");
  });
});
