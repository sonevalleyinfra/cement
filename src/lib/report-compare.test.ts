import { describe, expect, it } from "vitest";
import { compareDelta, deltaLabel, previousRange } from "./report-compare";

const prev = (from: string, to: string) => {
  const r = previousRange({ from, to });
  return [r.from, r.to];
};

describe("previousRange", () => {
  it("is the same number of days straight before", () => {
    expect(prev("2026-10-01", "2026-10-24")).toEqual(["2026-09-07", "2026-09-30"]);
  });
  it("works for one day", () => {
    expect(prev("2026-10-10", "2026-10-10")).toEqual(["2026-10-09", "2026-10-09"]);
  });
  it("works for 31 days", () => {
    expect(prev("2026-10-01", "2026-10-31")).toEqual(["2026-08-31", "2026-09-30"]);
  });
  it("crosses a year", () => {
    expect(prev("2027-01-01", "2027-01-10")).toEqual(["2026-12-22", "2026-12-31"]);
  });
  it("crosses a leap day", () => {
    expect(prev("2028-03-01", "2028-03-03")).toEqual(["2028-02-27", "2028-02-29"]);
    expect(prev("2027-03-01", "2027-03-03")).toEqual(["2027-02-26", "2027-02-28"]);
  });
  it("keeps India day starts and an exclusive end", () => {
    const r = previousRange({ from: "2026-10-10", to: "2026-10-12" });
    expect(r.start.toISOString()).toBe("2026-10-06T18:30:00.000Z");
    expect(r.end.toISOString()).toBe("2026-10-09T18:30:00.000Z");
  });
});

describe("compareDelta", () => {
  it("has no percent from a zero baseline", () => {
    expect(compareDelta(500, 0)).toEqual({ delta: 500, pct: null });
    expect(compareDelta(0, 0)).toEqual({ delta: 0, pct: null });
  });
  it("increase and decrease", () => {
    expect(compareDelta(112, 100)).toEqual({ delta: 12, pct: 12 });
    expect(compareDelta(95, 100)).toEqual({ delta: -5, pct: -5 });
    expect(compareDelta(0, 100)).toEqual({ delta: -100, pct: -100 });
  });
  it("rounds to a whole percent, half away from zero", () => {
    expect(compareDelta(101, 3)).toEqual({ delta: 98, pct: 3267 });
    expect(compareDelta(1005, 1000).pct).toBe(1);
    expect(compareDelta(995, 1000).pct).toBe(-1);
    expect(compareDelta(1004, 1000).pct).toBe(0);
  });
  it("measures against the size of a negative previous value", () => {
    expect(compareDelta(-50, -100)).toEqual({ delta: 50, pct: 50 });
    expect(compareDelta(-150, -100)).toEqual({ delta: -50, pct: -50 });
  });
  it("stays exact for big paise", () => {
    expect(compareDelta(2_000_000_000_001, 1_000_000_000_000).pct).toBe(100);
  });
});

describe("deltaLabel", () => {
  it("writes direction with a true minus", () => {
    expect(deltaLabel(112, 100)).toEqual({ text: "+12%", tone: "up" });
    expect(deltaLabel(95, 100)).toEqual({ text: "−5%", tone: "down" });
    expect(deltaLabel(100, 100)).toEqual({ text: "0%", tone: "flat" });
  });
  it("says new or a dash on a zero baseline, never Infinity or NaN", () => {
    expect(deltaLabel(500, 0)).toEqual({ text: "new", tone: "up" });
    expect(deltaLabel(0, 0)).toEqual({ text: "–", tone: "flat" });
  });
  it("keeps the direction colour for a change that rounds to 0%", () => {
    expect(deltaLabel(1004, 1000)).toEqual({ text: "0%", tone: "up" });
  });
});
