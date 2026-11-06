import { describe, expect, it } from "vitest";
import { canSwitchOffTruck, isLoaded, isStanding, truckCounts, truckSaveDecision } from "./truck-rules";

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
