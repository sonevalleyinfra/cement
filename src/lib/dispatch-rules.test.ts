import { describe, expect, it } from "vitest";
import {
  assigneeAfterDispatch,
  canDispatchOrder,
  canMarkDelivered,
  checkDispatchFields,
  checkRateEdit,
  stepTimes,
  isDispatchable,
  isRateEditReason,
  isValidAssignee,
  logisticsCandidates,
  ordersUserMayDispatch,
  planDispatch,
  rateEditReason,
  validAssigneeIds,
} from "./dispatch-rules";
import { pickNextAssignee } from "./order-rules";

describe("isDispatchable / canMarkDelivered", () => {
  it("allows approved, assigned and partly dispatched only", () => {
    for (const s of ["approved", "assigned", "partly_dispatched"]) expect(isDispatchable(s)).toBe(true);
    for (const s of ["placed", "rate_filled", "rejected", "dispatched", "delivered", "cancelled", "x"]) {
      expect(isDispatchable(s)).toBe(false);
    }
  });
  it("delivered only after full dispatch", () => {
    expect(canMarkDelivered("dispatched")).toBe(true);
    expect(canMarkDelivered("partly_dispatched")).toBe(false);
    expect(canMarkDelivered("approved")).toBe(false);
  });
});

describe("checkRateEdit", () => {
  it("no new rate or the same rate means no edit", () => {
    expect(checkRateEdit(30000, null, "")).toEqual({ ok: true, newRatePaise: null, reason: "" });
    expect(checkRateEdit(30000, 30000, "")).toEqual({ ok: true, newRatePaise: null, reason: "" });
  });
  it("a changed rate needs a reason", () => {
    expect(checkRateEdit(30000, 31000, "  ").ok).toBe(false);
    expect(checkRateEdit(30000, 31000, undefined).ok).toBe(false);
    expect(checkRateEdit(30000, 31000, " freight up ")).toEqual({
      ok: true,
      newRatePaise: 31000,
      reason: "freight up",
    });
  });
  it("rejects a zero or fractional rate", () => {
    expect(checkRateEdit(30000, 0, "x").ok).toBe(false);
    expect(checkRateEdit(30000, 10.5, "x").ok).toBe(false);
  });
});

describe("checkDispatchFields", () => {
  const godown = "godown:0b9c7f2e-1d4a-4c3b-9a8e-123456789abc";
  const base = { vehicleNumber: "br01 ab 1234", fromPlace: godown, driverName: " Ram  Singh ", driverPhone: "" };
  it("accepts and tidies", () => {
    expect(checkDispatchFields(base)).toEqual({
      ok: true,
      from: { kind: "godown", id: "0b9c7f2e-1d4a-4c3b-9a8e-123456789abc" },
      vehicleNumber: "BR01AB1234",
      driverName: "Ram Singh",
      driverPhone: "",
    });
  });
  it("needs a valid truck number, place and driver name", () => {
    expect(checkDispatchFields({ ...base, vehicleNumber: "" })).toEqual({ ok: false, error: "Enter the truck number." });
    expect(checkDispatchFields({ ...base, vehicleNumber: "BR01" }).ok).toBe(false);
    expect(checkDispatchFields({ ...base, fromPlace: null }).ok).toBe(false);
    expect(checkDispatchFields({ ...base, fromPlace: "shop:1" }).ok).toBe(false);
    expect(checkDispatchFields({ ...base, driverName: " " }).ok).toBe(false);
  });
  it("checks the phone only when given", () => {
    expect(checkDispatchFields({ ...base, driverPhone: "12345" }).ok).toBe(false);
    expect(checkDispatchFields({ ...base, driverPhone: "9876543210" }).ok).toBe(true);
  });
});

describe("planDispatch", () => {
  const base = { status: "assigned", orderedBags: 100, alreadyDispatchedBags: 0, bags: 40, stockBalance: 500 };
  it("partial dispatch keeps the order partly dispatched", () => {
    expect(planDispatch(base)).toEqual({ ok: true, newStatus: "partly_dispatched", statusSteps: ["partly_dispatched"] });
  });
  it("the last bags make it dispatched", () => {
    const p = planDispatch({ ...base, status: "partly_dispatched", alreadyDispatchedBags: 60, bags: 40 });
    expect(p).toEqual({ ok: true, newStatus: "dispatched", statusSteps: ["dispatched"] });
  });
  it("an approved order passes through assigned", () => {
    const p = planDispatch({ ...base, status: "approved", bags: 100 });
    expect(p).toEqual({ ok: true, newStatus: "dispatched", statusSteps: ["assigned", "dispatched"] });
  });
  it("never above remaining", () => {
    expect(planDispatch({ ...base, alreadyDispatchedBags: 80, bags: 21 }).ok).toBe(false);
  });
  it("needs enough stock", () => {
    const p = planDispatch({ ...base, stockBalance: 10 });
    expect(p).toEqual({ ok: false, error: "Only 10 bags in stock." });
  });
  it("refuses wrong statuses", () => {
    expect(planDispatch({ ...base, status: "rate_filled" }).ok).toBe(false);
    expect(planDispatch({ ...base, status: "cancelled" }).ok).toBe(false);
    expect(planDispatch({ ...base, status: "dispatched" }).ok).toBe(false);
  });
});

describe("stepTimes", () => {
  it("spaces history rows 1 ms apart, in order", () => {
    const t = stepTimes(new Date(1000), 3).map((d) => d.getTime());
    expect(t).toEqual([1000, 1001, 1002]);
  });
});

describe("isValidAssignee", () => {
  const ok = { id: "l1", role: "logistics", banned: false };
  it("needs the logistics role and not banned", () => {
    expect(isValidAssignee(ok)).toBe(true);
    expect(isValidAssignee({ ...ok, banned: null })).toBe(true);
    expect(isValidAssignee({ ...ok, role: "sales,logistics" })).toBe(true);
    expect(isValidAssignee({ ...ok, banned: true })).toBe(false);
    expect(isValidAssignee({ ...ok, role: "sales" })).toBe(false);
    expect(isValidAssignee({ ...ok, role: "admin" })).toBe(false);
    expect(isValidAssignee(null)).toBe(false);
  });
  it("lists the valid ids", () => {
    const people = [ok, { ...ok, id: "l2", banned: true }, { ...ok, id: "l3", role: "sales" }, { ...ok, id: "l4" }];
    expect([...validAssigneeIds(people)]).toEqual(["l1", "l4"]);
  });
});

describe("logisticsCandidates + round robin", () => {
  const people = [
    { id: "c", role: "logistics", banned: false },
    { id: "a", role: "logistics", banned: false },
    { id: "b", role: "logistics", banned: true },
    { id: "s", role: "sales", banned: false },
  ];
  it("keeps logistics people, by id, banned as inactive", () => {
    expect(logisticsCandidates(people)).toEqual([
      { id: "a", active: true },
      { id: "b", active: false },
      { id: "c", active: true },
    ]);
  });
  it("takes turns and skips the banned person", () => {
    const list = logisticsCandidates(people);
    expect(pickNextAssignee(list, null)).toBe("a");
    expect(pickNextAssignee(list, "a")).toBe("c");
    expect(pickNextAssignee(list, "c")).toBe("a");
  });
  it("nobody to pick", () => {
    expect(pickNextAssignee(logisticsCandidates([people[3]]), null)).toBeNull();
  });
});

describe("canDispatchOrder", () => {
  const me = { id: "l1", role: "logistics" };
  it("admin always", () => {
    expect(canDispatchOrder({ id: "x", role: "admin" }, { logisticsId: "l2" }, true)).toBe(true);
  });
  it("logistics: own, unassigned, or assignee no longer valid", () => {
    expect(canDispatchOrder(me, { logisticsId: "l1" }, true)).toBe(true);
    expect(canDispatchOrder(me, { logisticsId: null }, false)).toBe(true);
    expect(canDispatchOrder(me, { logisticsId: "l2" }, false)).toBe(true);
  });
  it("not someone else's order while they can still do it", () => {
    expect(canDispatchOrder(me, { logisticsId: "l2" }, true)).toBe(false);
  });
  it("needs the logistics role", () => {
    expect(canDispatchOrder({ ...me, role: "sales" }, { logisticsId: null }, true)).toBe(false);
    expect(canDispatchOrder({ ...me, role: null }, { logisticsId: "l1" }, true)).toBe(false);
  });
});

describe("assigneeAfterDispatch", () => {
  it("keeps a valid assignee", () => expect(assigneeAfterDispatch("l2", "x", true)).toBe("l2"));
  it("the dispatcher takes an unassigned order", () => expect(assigneeAfterDispatch(null, "l1", false)).toBe("l1"));
  it("the dispatcher takes over from someone no longer valid", () =>
    expect(assigneeAfterDispatch("l2", "l1", false)).toBe("l1"));
});

describe("rate edit history reason", () => {
  it("is recognisable and has no price", () => {
    expect(rateEditReason("market fell")).toBe("Rate edited: market fell");
    expect(isRateEditReason(rateEditReason("x"))).toBe(true);
    expect(isRateEditReason("40 bags in KA01")).toBe(false);
    expect(isRateEditReason(null)).toBe(false);
  });
});

describe("ordersUserMayDispatch", () => {
  const people = [
    { id: "l1", role: "logistics", banned: false },
    { id: "l2", role: "logistics", banned: false },
    { id: "gone", role: "logistics", banned: true },
    { id: "moved", role: "sales", banned: false },
  ];
  const orders = [
    { id: "mine", logisticsId: "l1" },
    { id: "theirs", logisticsId: "l2" },
    { id: "nobody", logisticsId: null },
    { id: "banned", logisticsId: "gone" },
    { id: "lostRole", logisticsId: "moved" },
  ];
  it("logistics sees own, unassigned and orphaned orders", () => {
    const ids = ordersUserMayDispatch({ id: "l1", role: "logistics" }, orders, people).map((o) => o.id);
    expect(ids).toEqual(["mine", "nobody", "banned", "lostRole"]);
  });
  it("admin sees everything", () => {
    expect(ordersUserMayDispatch({ id: "a", role: "admin" }, orders, people)).toHaveLength(orders.length);
  });
  it("someone without the logistics role sees nothing", () => {
    expect(ordersUserMayDispatch({ id: "x", role: "sales" }, orders, people)).toEqual([]);
  });
});
