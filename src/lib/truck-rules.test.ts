import { describe, expect, it } from "vitest";
import { driverChange, activeLoadedTrucks, canSwitchOffTruck, isLoaded, isStanding, truckCounts, truckSaveDecision } from "./truck-rules";

describe("truckCounts", () => {
  it("counts only switched-on trucks", () => {
    const trucks = [
      { active: true, bags: 20 },
      { active: true, bags: 0 },
      { active: true, bags: 0 },
      { active: false, bags: 0 },
      { active: false, bags: 5 },
    ];
    expect(truckCounts(trucks)).toEqual({ loaded: 1, standing: 2 });
  });

  it("is zero for no trucks", () => {
    expect(truckCounts([])).toEqual({ loaded: 0, standing: 0 });
  });

  it("loaded and standing never overlap", () => {
    expect(isLoaded({ active: true, bags: 1 })).toBe(true);
    expect(isStanding({ active: true, bags: 1 })).toBe(false);
    expect(isLoaded({ active: false, bags: 1 })).toBe(false);
    expect(isStanding({ active: false, bags: 0 })).toBe(false);
  });
});

describe("activeLoadedTrucks", () => {
  it("keeps only active trucks with bags > 0 and removes 0-bag or hidden trucks from UI", () => {
    const rows = [
      { number: "UP65AA1111", active: true, bags: 120 },
      { number: "UP65BB2222", active: true, bags: 0 },
      { number: "UP65CC3333", active: false, bags: 50 },
      { number: "UP65DD4444", active: true, bags: 1 },
    ];
    expect(activeLoadedTrucks(rows).map((r) => r.number)).toEqual(["UP65AA1111", "UP65DD4444"]);
  });
});

describe("canSwitchOffTruck", () => {
  it("allows an empty truck", () => {
    expect(canSwitchOffTruck(0)).toEqual({ ok: true });
  });

  it("blocks a truck with bags", () => {
    expect(canSwitchOffTruck(1)).toEqual({ ok: false, error: "Unload the truck first" });
  });
});

describe("truckSaveDecision", () => {
  it("creates a new number", () => {
    expect(truckSaveDecision(null)).toBe("create");
  });

  it("fills a truck made by a purchase or dispatch", () => {
    expect(truckSaveDecision({ driverName: "", active: true })).toBe("fill");
    expect(truckSaveDecision({ driverName: "   ", active: false })).toBe("fill");
  });

  it("refuses a truck already in the list", () => {
    expect(truckSaveDecision({ driverName: "Ravi", active: true })).toBe("duplicate");
    expect(truckSaveDecision({ driverName: "Ravi", active: false })).toBe("duplicate");
  });
});

describe("driverChange", () => {
  const saved = { driverName: "Ravi", driverPhone: "9876543210" };

  it("is nothing when the same driver is typed again", () => {
    expect(driverChange(saved, { name: " Ravi ", phone: "98765 43210" })).toBeNull();
  });

  it("keeps the saved name or phone when one is left empty", () => {
    expect(driverChange(saved, { name: "", phone: "" })).toBeNull();
    expect(driverChange(saved, undefined)).toBeNull();
    expect(driverChange(saved, { name: "Mohan", phone: null })).toEqual({
      from: saved,
      to: { driverName: "Mohan", driverPhone: "9876543210" },
    });
  });

  it("gives the old and the new driver when the name or the phone changes", () => {
    expect(driverChange(saved, { name: "Mohan", phone: "9123456780" })).toEqual({
      from: saved,
      to: { driverName: "Mohan", driverPhone: "9123456780" },
    });
    expect(driverChange(saved, { name: "Ravi", phone: "9123456780" })?.to).toEqual({ driverName: "Ravi", driverPhone: "9123456780" });
  });

  it("fills a truck that has no driver yet", () => {
    expect(driverChange({ driverName: "", driverPhone: "" }, { name: "Ravi", phone: "9876543210" })?.to).toEqual(saved);
  });
});
