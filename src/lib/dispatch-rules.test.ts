import { describe, expect, it } from "vitest";
import { checkDispatchFields, isDispatchable, planDispatch } from "./dispatch-rules";

describe("isDispatchable", () => {
  it("allows approved and partly dispatched only", () => {
    for (const s of ["approved", "partly_dispatched"]) expect(isDispatchable(s)).toBe(true);
    for (const s of ["placed", "rejected", "dispatched", "cancelled", "assigned", "x"]) {
      expect(isDispatchable(s)).toBe(false);
    }
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
  const base = { status: "approved", orderedBags: 100, alreadyDispatchedBags: 0, bags: 40, ratePaise: 35000, stockBalance: 500 };
  it("a partial dispatch makes the order partly dispatched and bills bags x rate", () => {
    expect(planDispatch(base)).toEqual({ ok: true, newStatus: "partly_dispatched", ratePaise: 35000, amountPaise: 1400000 });
  });
  it("the last bags make it dispatched", () => {
    const p = planDispatch({ ...base, status: "partly_dispatched", alreadyDispatchedBags: 60, bags: 40 });
    expect(p).toMatchObject({ ok: true, newStatus: "dispatched" });
  });
  it("all bags at once go straight to dispatched", () => {
    expect(planDispatch({ ...base, bags: 100 })).toMatchObject({ ok: true, newStatus: "dispatched", amountPaise: 3500000 });
  });
  it("bills at the order's rate now (a changed rate applies to the next loads)", () => {
    const first = planDispatch(base);
    const second = planDispatch({ ...base, status: "partly_dispatched", alreadyDispatchedBags: 40, bags: 60, ratePaise: 36000 });
    expect(first.ok && first.amountPaise).toBe(40 * 35000);
    expect(second.ok && second.amountPaise).toBe(60 * 36000);
  });
  it("never above remaining", () => {
    expect(planDispatch({ ...base, alreadyDispatchedBags: 80, bags: 21 }).ok).toBe(false);
  });
  it("needs enough stock", () => {
    expect(planDispatch({ ...base, stockBalance: 10 })).toEqual({ ok: false, error: "Only 10 bags in stock." });
  });
  it("needs a rate", () => {
    expect(planDispatch({ ...base, ratePaise: null })).toEqual({ ok: false, error: "This order has no rate yet." });
  });
  it("refuses wrong statuses", () => {
    for (const status of ["placed", "rejected", "cancelled", "dispatched"]) {
      expect(planDispatch({ ...base, status })).toEqual({ ok: false, error: "This order is not ready to dispatch." });
    }
  });
});
