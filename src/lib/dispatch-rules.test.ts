import { describe, expect, it } from "vitest";
import { checkDispatchFields, isDispatchable, planDispatch, placesWithEnough, truckAfterPlacePick, truckChips } from "./dispatch-rules";

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

describe("truckAfterPlacePick", () => {
  it("picking a truck fills in its number", () => {
    expect(truckAfterPlacePick("", null, "BR01AB1234")).toEqual({ truck: "BR01AB1234", autoFilled: "BR01AB1234" });
  });
  it("switching between godowns keeps a typed number", () => {
    expect(truckAfterPlacePick("BR02CD5678", null, null)).toEqual({ truck: "BR02CD5678", autoFilled: null });
  });
  it("leaving a truck for a godown clears only the number that truck filled in", () => {
    expect(truckAfterPlacePick("BR01AB1234", "BR01AB1234", null)).toEqual({ truck: "", autoFilled: null });
    // Edited after it was filled in: the person typed it, so keep it.
    expect(truckAfterPlacePick("BR01AB9999", "BR01AB1234", null)).toEqual({ truck: "BR01AB9999", autoFilled: null });
  });
});

describe("placesWithEnough", () => {
  const places = [
    { key: "godown:a", name: "Main", truck: null },
    { key: "godown:b", name: "Old", truck: null },
    { key: "vehicle:t", name: "Truck BR01", truck: "BR01" },
  ];
  const balances = [
    { productId: "p1", placeKey: "godown:a", bags: 100 },
    { productId: "p1", placeKey: "godown:b", bags: 0 },
    { productId: "p2", placeKey: "godown:b", bags: 500 },
    { productId: "p1", placeKey: "vehicle:t", bags: 40 },
  ];
  it("drops places with 0 bags of that product", () => {
    expect(placesWithEnough(places, balances, "p1", 0).map((p) => p.key)).toEqual(["godown:a", "vehicle:t"]);
    expect(placesWithEnough(places, balances, "p2", 10).map((p) => p.key)).toEqual(["godown:b"]);
  });
  it("drops places holding fewer bags than asked", () => {
    expect(placesWithEnough(places, balances, "p1", 50).map((p) => p.key)).toEqual(["godown:a"]);
    expect(placesWithEnough(places, balances, "p1", 40).map((p) => p.key)).toEqual(["godown:a", "vehicle:t"]);
    expect(placesWithEnough(places, balances, "p1", 101)).toEqual([]);
  });
  it("reports the bags held", () => {
    expect(placesWithEnough(places, balances, "p1", 1)[0].bagsHere).toBe(100);
  });
  it("lists nothing for a product with no stock", () => {
    expect(placesWithEnough(places, balances, "p9", 1)).toEqual([]);
  });
});

describe("truckChips", () => {
  const recent = [
    { truck: "BR02", driverName: "Ravi", driverPhone: "9" },
    { truck: "BR01", driverName: "Sonu", driverPhone: "" },
    { truck: "BR02", driverName: "Old driver", driverPhone: "1" },
  ];
  it("puts loaded trucks first, then recent ones, newest first, one chip per truck", () => {
    expect(truckChips(["BR01", "BR09"], recent).map((c) => c.truck)).toEqual(["BR01", "BR09", "BR02"]);
  });
  it("fills the driver from the newest dispatch of that truck", () => {
    expect(truckChips([], recent)[0]).toEqual({ truck: "BR02", driverName: "Ravi", driverPhone: "9" });
    expect(truckChips(["BR09"], recent)[0]).toEqual({ truck: "BR09", driverName: "", driverPhone: "" });
  });
  it("caps the list", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ truck: `T${i}`, driverName: "d", driverPhone: "" }));
    expect(truckChips([], many)).toHaveLength(6);
    expect(truckChips([], many, 2)).toHaveLength(2);
  });
  it("is empty with no trucks", () => {
    expect(truckChips([], [])).toEqual([]);
  });
});
