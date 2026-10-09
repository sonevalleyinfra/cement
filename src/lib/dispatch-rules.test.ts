import { describe, expect, it } from "vitest";
import {
  canMarkDelivered,
  checkDispatchFields,
  checkRateEdit,
  stepTimes,
  isDispatchable,
  planDispatch,
} from "./dispatch-rules";

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
  const base = { readOnlyMode: false, vehicleId: "v", locationId: "l", driverName: " Ram  Singh ", driverPhone: "" };
  it("accepts and tidies", () => {
    expect(checkDispatchFields(base)).toEqual({ ok: true, driverName: "Ram Singh", driverPhone: "" });
  });
  it("blocks All firms mode", () => {
    expect(checkDispatchFields({ ...base, readOnlyMode: true }).ok).toBe(false);
  });
  it("needs vehicle, location and driver name", () => {
    expect(checkDispatchFields({ ...base, vehicleId: null }).ok).toBe(false);
    expect(checkDispatchFields({ ...base, locationId: null }).ok).toBe(false);
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
