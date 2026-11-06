import { describe, expect, it } from "vitest";
import { ROLES } from "./roles";
import {
  ALLOWED_TRANSITIONS,
  ORDER_STATUSES,
  canCancelOrder,
  canTransition,
  canUserTransition,
  checkDispatchBags,
  cleanReason,
  isFinalStatus,
  isOrderStatus,
  isValidBags,
  isValidRatePaise,
  isValidReason,
  orderTotalPaise,
  orderValuePaise,
  planCancel,
  remainingBags,
  rolesForTransition,
  statusAfterDispatch,
} from "./order-rules";

describe("statuses", () => {
  it("are exactly the spec's six", () => {
    expect([...ORDER_STATUSES]).toEqual(["placed", "approved", "rejected", "partly_dispatched", "dispatched", "cancelled"]);
  });
  it("old steps are gone", () => {
    for (const s of ["rate_filled", "assigned", "delivered", "nope"]) expect(isOrderStatus(s)).toBe(false);
  });
});

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
    const path = ["placed", "approved", "partly_dispatched", "dispatched"] as const;
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i], path[i + 1])).toBe(true);
    expect(canTransition("approved", "dispatched")).toBe(true);
    expect(canTransition("placed", "rejected")).toBe(true);
  });
  it("allows several partial dispatches", () => {
    expect(canTransition("partly_dispatched", "partly_dispatched")).toBe(true);
  });
  it("cancel is possible until everything is sent", () => {
    for (const s of ["placed", "approved", "partly_dispatched"] as const) expect(canTransition(s, "cancelled")).toBe(true);
    for (const s of ["rejected", "dispatched", "cancelled"] as const) expect(canTransition(s, "cancelled")).toBe(false);
  });
  it("rejected, dispatched and cancelled are final", () => {
    for (const s of ["rejected", "dispatched", "cancelled"] as const) expect(isFinalStatus(s)).toBe(true);
    for (const s of ["placed", "approved", "partly_dispatched"] as const) expect(isFinalStatus(s)).toBe(false);
  });
  it("cannot skip approval or go backwards", () => {
    expect(canTransition("placed", "dispatched")).toBe(false);
    expect(canTransition("placed", "partly_dispatched")).toBe(false);
    expect(canTransition("approved", "placed")).toBe(false);
    expect(canTransition("approved", "rejected")).toBe(false);
  });
});

describe("roles per transition", () => {
  const cases: [Parameters<typeof canTransition>[0], Parameters<typeof canTransition>[1], string][] = [
    ["placed", "approved", "accounts"],
    ["placed", "rejected", "accounts"],
    ["approved", "partly_dispatched", "logistics"],
    ["approved", "dispatched", "logistics"],
    ["partly_dispatched", "partly_dispatched", "logistics"],
    ["partly_dispatched", "dispatched", "logistics"],
    ["placed", "cancelled", "admin"],
    ["approved", "cancelled", "admin"],
    ["partly_dispatched", "cancelled", "admin"],
  ];
  for (const [from, to, owner] of cases) {
    for (const role of ROLES) {
      const expected = to === "cancelled" ? ["admin", "sales", "logistics"].includes(role) : role === "admin" || role === owner;
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
    expect(canUserTransition("admin", "placed", "dispatched")).toBe(false);
    expect(rolesForTransition("dispatched", "placed")).toEqual([]);
  });
  it("handles multiple and missing roles", () => {
    expect(canUserTransition("sales,accounts", "placed", "approved")).toBe(true);
    expect(canUserTransition(null, "placed", "approved")).toBe(false);
  });
});

describe("canCancelOrder", () => {
  it("admin, sales and logistics can cancel", () => {
    expect(canCancelOrder("admin", "approved")).toBe(true);
    for (const role of ["admin", "sales", "logistics"]) {
      expect(canCancelOrder(role, "approved")).toBe(true);
    }
    for (const role of ["accounts", "retailer", null]) {
      expect(canCancelOrder(role, "approved")).toBe(false);
    }
  });
  it("only while placed, approved or partly dispatched", () => {
    for (const s of ["placed", "approved", "partly_dispatched"]) expect(canCancelOrder("admin", s)).toBe(true);
    for (const s of ["rejected", "dispatched", "cancelled", "nonsense"]) expect(canCancelOrder("admin", s)).toBe(false);
  });
});

describe("planCancel", () => {
  const base = { role: "admin", orderedBags: 100, dispatchedBags: 0, reasonCode: "entry_mistake" as unknown, note: "wrong product" as unknown };

  it("nothing sent: the whole order is cancelled", () => {
    for (const status of ["placed", "approved"]) {
      expect(planCancel({ ...base, status })).toEqual({ ok: true, code: "entry_mistake", note: "wrong product", cancelledBags: 100 });
    }
  });
  it("partly dispatched: only the bags not sent are cancelled", () => {
    expect(
      planCancel({ ...base, status: "partly_dispatched", dispatchedBags: 40, reasonCode: "shop_asked", note: "  shop   closed  " }),
    ).toEqual({ ok: true, code: "shop_asked", note: "shop closed", cancelledBags: 60 });
  });
  it("the note is optional, except for Other", () => {
    expect(planCancel({ ...base, status: "placed", reasonCode: "truck_issue", note: "" })).toMatchObject({ ok: true, note: "" });
    expect(planCancel({ ...base, status: "placed", reasonCode: "other", note: " " })).toEqual({ ok: false, error: "Add a note" });
    expect(planCancel({ ...base, status: "placed", reasonCode: "other", note: "moved town" })).toMatchObject({ ok: true, code: "other" });
  });
  it("refuses when every bag is already sent", () => {
    expect(planCancel({ ...base, status: "partly_dispatched", dispatchedBags: 100 })).toEqual({
      ok: false,
      error: "Every bag is already dispatched.",
    });
  });
  it("refuses final orders", () => {
    for (const status of ["dispatched", "rejected", "cancelled", "nonsense"]) {
      expect(planCancel({ ...base, status, dispatchedBags: 10 }).ok).toBe(false);
    }
  });
  it("refuses unauthorised roles", () => {
    for (const role of ["accounts", "retailer", null]) {
      expect(planCancel({ ...base, role, status: "approved" })).toEqual({ ok: false, error: "You cannot cancel this order." });
    }
  });
  it("needs a reason code from the cancel list", () => {
    expect(planCancel({ ...base, status: "approved", reasonCode: null })).toEqual({ ok: false, error: "Pick a reason" });
    expect(planCancel({ ...base, status: "approved", reasonCode: "rate_dispute" })).toEqual({ ok: false, error: "Pick a reason" });
  });
  it("refuses a long note", () => {
    expect(planCancel({ ...base, status: "placed", note: "x".repeat(201) })).toEqual({
      ok: false,
      error: "Keep the note under 200 characters",
    });
  });
});

describe("orderValuePaise", () => {
  const order = { status: "partly_dispatched", bags: 100, ratePaise: 40000 };
  it("is null without a rate", () => expect(orderValuePaise({ ...order, status: "placed", ratePaise: null, loads: [] })).toBeNull());
  it("is bags x rate before any load", () =>
    expect(orderValuePaise({ ...order, status: "approved", loads: [] })).toBe(4000000));
  it("each load at the rate it was billed at, the rest at the current rate", () => {
    // 30 went at ₹410; then the rate changed to ₹400 for the rest.
    const loads = [
      { bags: 30, ratePaise: 41000 },
      { bags: 20, ratePaise: 40000 },
    ];
    expect(orderValuePaise({ ...order, loads })).toBe(30 * 41000 + 20 * 40000 + 50 * 40000);
  });
  it("a cancelled order is worth only what was sent", () => {
    expect(orderValuePaise({ ...order, status: "cancelled", loads: [{ bags: 40, ratePaise: 40000 }] })).toBe(40 * 40000);
  });
  it("is null for a rejected or cancelled order with nothing sent", () => {
    expect(orderValuePaise({ ...order, status: "rejected", loads: [] })).toBeNull();
    expect(orderValuePaise({ ...order, status: "cancelled", loads: [] })).toBeNull();
  });
  it("a fully dispatched order is the sum of its loads", () => {
    const loads = [
      { bags: 50, ratePaise: 39000 },
      { bags: 50, ratePaise: 40000 },
    ];
    expect(orderValuePaise({ ...order, status: "dispatched", loads })).toBe(50 * 39000 + 50 * 40000);
  });
});

describe("reason and rate", () => {
  it("reason", () => {
    expect(isValidReason("too much due")).toBe(true);
    expect(isValidReason("   ")).toBe(false);
    expect(isValidReason(undefined)).toBe(false);
    expect(cleanReason("  x  ")).toBe("x");
    expect(cleanReason(null)).toBe("");
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
  it("status after dispatch comes from the bags sent so far", () => {
    expect(statusAfterDispatch(100, 40)).toBe("partly_dispatched");
    expect(statusAfterDispatch(100, 100)).toBe("dispatched");
  });
});

describe("bag wording in messages", () => {
  it("says 'bag is' for one and 'bags are' for more", () => {
    expect(checkDispatchBags(10, 9, 5)).toEqual({ ok: false, error: "Only 1 bag is left to dispatch." });
    expect(checkDispatchBags(10, 5, 9)).toEqual({ ok: false, error: "Only 5 bags are left to dispatch." });
  });
});
