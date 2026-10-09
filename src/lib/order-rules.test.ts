import { describe, expect, it } from "vitest";
import { ROLES } from "./roles";
import {
  ALLOWED_TRANSITIONS,
  ORDER_STATUSES,
  approvalStepAssignee,
  approvalSteps,
  canTransition,
  canUserTransition,
  checkDispatchBags,
  isCloseShort,
  isFinalStatus,
  isOrderStatus,
  isValidBags,
  isValidRatePaise,
  isValidReason,
  lastRoundRobinAssignee,
  orderTotalPaise,
  orderValuePaise,
  pickNextAssignee,
  planCancel,
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

describe("planCancel", () => {
  const base = { orderedBags: 100, dispatchedBags: 0, ratePaise: 40000, postedNetPaise: 0, reason: "wrong firm" };

  it("before approval: cancelled, nothing billed", () => {
    for (const status of ["placed", "rate_filled"]) {
      expect(planCancel({ ...base, status })).toEqual({
        ok: true,
        newStatus: "cancelled",
        ledgerPaise: 0,
        historyReason: "wrong firm",
        closedShortBags: null,
      });
    }
  });
  it("approved or assigned with nothing sent: reverses the whole net bill", () => {
    for (const status of ["approved", "assigned"]) {
      const p = planCancel({ ...base, status, postedNetPaise: 4000000 });
      expect(p).toMatchObject({ ok: true, newStatus: "cancelled", ledgerPaise: -4000000, closedShortBags: null });
    }
  });
  it("partly dispatched: closes short, only the bags not sent come off at the order rate", () => {
    // 100 ordered at ₹400, 40 sent. 60 x ₹400 = ₹24,000 comes off; the 40 sent stay billed.
    const p = planCancel({
      ...base,
      status: "partly_dispatched",
      dispatchedBags: 40,
      postedNetPaise: 4000000 + 40 * 1000, // first truck went at ₹410
      reason: "  shop closed  ",
    });
    expect(p).toEqual({
      ok: true,
      newStatus: "dispatched",
      ledgerPaise: -2400000,
      historyReason: "Closed short: 60 bags not sent. shop closed",
      closedShortBags: 60,
    });
  });
  it("what stays billed after closing short = the loads that went out, each at its truck rate", () => {
    const posted = 100 * 40000 + 40 * (41000 - 40000); // approval + truck rate edit on 40 bags
    const p = planCancel({ ...base, status: "partly_dispatched", dispatchedBags: 40, postedNetPaise: posted });
    if (!p.ok) throw new Error(p.error);
    expect(posted + p.ledgerPaise).toBe(40 * 41000);
  });
  it("says bag for one bag", () => {
    const p = planCancel({ ...base, status: "partly_dispatched", dispatchedBags: 99 });
    expect(p.ok && p.historyReason).toBe("Closed short: 1 bag not sent. wrong firm");
  });
  it("refuses to close short without a rate or when everything is sent", () => {
    expect(planCancel({ ...base, status: "partly_dispatched", dispatchedBags: 40, ratePaise: null }).ok).toBe(false);
    expect(planCancel({ ...base, status: "partly_dispatched", dispatchedBags: 100 }).ok).toBe(false);
  });
  it("ignores a negative bag count", () => {
    expect(planCancel({ ...base, status: "assigned", dispatchedBags: -5 })).toMatchObject({ ok: true, newStatus: "cancelled" });
  });
  it("refuses final or fully dispatched orders", () => {
    for (const status of ["dispatched", "delivered", "rejected", "cancelled", "nonsense"]) {
      expect(planCancel({ ...base, status, dispatchedBags: 10 }).ok).toBe(false);
    }
  });
  it("needs a reason", () => {
    expect(planCancel({ ...base, status: "approved", reason: "  " }).ok).toBe(false);
    expect(planCancel({ ...base, status: "approved", reason: null }).ok).toBe(false);
  });
  it("cuts a long reason", () => {
    const p = planCancel({ ...base, status: "placed", reason: "x".repeat(500) });
    expect(p.ok && p.historyReason.length).toBe(300);
  });
});

describe("isCloseShort", () => {
  it("only after approval with bags sent", () => {
    expect(isCloseShort("partly_dispatched", 10)).toBe(true);
    expect(isCloseShort("partly_dispatched", 0)).toBe(false);
    expect(isCloseShort("placed", 10)).toBe(false);
    expect(isCloseShort("dispatched", 10)).toBe(false);
  });
});

describe("orderValuePaise", () => {
  const order = { status: "partly_dispatched", bags: 100, ratePaise: 40000 };
  it("is null without a rate", () => expect(orderValuePaise({ ...order, ratePaise: null, loads: [] })).toBeNull());
  it("is bags x rate before any load", () =>
    expect(orderValuePaise({ ...order, status: "approved", loads: [] })).toBe(4000000));
  it("prices each load at its own rate and the rest at the order rate", () => {
    const loads = [
      { bags: 30, ratePaise: 41000 },
      { bags: 20, ratePaise: null },
    ];
    expect(orderValuePaise({ ...order, loads })).toBe(30 * 41000 + 20 * 40000 + 50 * 40000);
  });
  it("a rate edit on one truck does not change the other trucks", () => {
    const loads = [
      { bags: 50, ratePaise: 39000 },
      { bags: 50, ratePaise: null },
    ];
    expect(orderValuePaise({ ...order, status: "dispatched", loads })).toBe(50 * 39000 + 50 * 40000);
  });
  it("does not count bags not sent once closed short, delivered or cancelled", () => {
    const loads = [{ bags: 40, ratePaise: null }];
    for (const status of ["dispatched", "delivered", "cancelled"]) {
      expect(orderValuePaise({ ...order, status, loads })).toBe(40 * 40000);
    }
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

describe("approvalSteps", () => {
  it("goes on to assigned when someone was picked", () => {
    expect(approvalSteps("l1")).toEqual({ status: "assigned", steps: ["approved", "assigned"] });
  });
  it("stays approved when nobody is free", () => {
    expect(approvalSteps(null)).toEqual({ status: "approved", steps: ["approved"] });
  });
  it("every step is an allowed move", () => {
    const { steps } = approvalSteps("l1");
    let from: "rate_filled" | "approved" | "assigned" = "rate_filled";
    for (const step of steps) {
      expect(canTransition(from, step)).toBe(true);
      from = step;
    }
  });
});

describe("round robin's last assignee", () => {
  const at = (min: number) => new Date(Date.UTC(2026, 9, 1, 6, min));
  it("only the assigned step records who was picked", () => {
    expect(approvalStepAssignee("approved", "l1")).toBeNull();
    expect(approvalStepAssignee("assigned", "l1")).toBe("l1");
    expect(approvalStepAssignee("assigned", null)).toBeNull();
  });
  it("is whoever approval picked most recently", () => {
    const rows = [
      { assigneeId: "a", createdAt: at(1) },
      { assigneeId: "c", createdAt: at(3) },
      { assigneeId: "b", createdAt: at(2) },
    ];
    expect(lastRoundRobinAssignee(rows)).toBe("c");
  });
  it("ignores rows with no assignee (someone took the order at dispatch)", () => {
    const rows = [
      { assigneeId: "a", createdAt: at(1) },
      { assigneeId: null, createdAt: at(5) },
    ];
    expect(lastRoundRobinAssignee(rows)).toBe("a");
  });
  it("is null when round robin never picked anyone", () => {
    expect(lastRoundRobinAssignee([])).toBeNull();
    expect(lastRoundRobinAssignee([{ assigneeId: null, createdAt: at(1) }])).toBeNull();
  });
  it("a take-over at dispatch does not move the turn", () => {
    const list = [
      { id: "a", active: true },
      { id: "b", active: true },
      { id: "c", active: true },
    ];
    // Round robin gave "a"; then "c" took some order at dispatch (no assignee recorded).
    const rows = [
      { assigneeId: "a", createdAt: at(1) },
      { assigneeId: null, createdAt: at(2) },
    ];
    expect(pickNextAssignee(list, lastRoundRobinAssignee(rows))).toBe("b");
  });
});
