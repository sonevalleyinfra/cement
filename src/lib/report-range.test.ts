import { describe, expect, it } from "vitest";
import { addDays, daysBetween, inRange, isDateKey, istStartOf, optionalRange, pageParam, param, rangeQuery, reportRange } from "./report-range";

describe("isDateKey", () => {
  it("accepts real days only", () => {
    expect(isDateKey("2026-10-10")).toBe(true);
    expect(isDateKey("2024-02-29")).toBe(true);
    expect(isDateKey("2026-02-29")).toBe(false);
    expect(isDateKey("2026-13-01")).toBe(false);
    expect(isDateKey("1999-12-31")).toBe(false);
    expect(isDateKey("10-10-2026")).toBe(false);
    expect(isDateKey(undefined)).toBe(false);
  });
});

describe("addDays / daysBetween", () => {
  it("crosses months and years", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(daysBetween("2026-01-01", "2026-03-01")).toBe(59);
    expect(daysBetween("2026-03-01", "2026-01-01")).toBe(-59);
    expect(daysBetween("2026-05-05", "2026-05-05")).toBe(0);
  });
});

describe("reportRange", () => {
  // 10 Oct 2026, 20:00 UTC = 11 Oct 2026, 01:30 IST: "today" in India is the 11th.
  const now = new Date("2026-10-10T20:00:00Z");

  it("defaults to this month so far, in India", () => {
    const r = reportRange({}, now);
    expect(r.from).toBe("2026-10-01");
    expect(r.to).toBe("2026-10-11");
  });

  it("start is 00:00 IST of from, end is 00:00 IST of the day after to", () => {
    const r = reportRange({ from: "2026-10-01", to: "2026-10-05" }, now);
    expect(r.start.toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(r.end.toISOString()).toBe("2026-10-05T18:30:00.000Z");
  });

  it("swaps a backwards range and ignores bad dates", () => {
    const r = reportRange({ from: "2026-10-05", to: "2026-10-01" }, now);
    expect([r.from, r.to]).toEqual(["2026-10-01", "2026-10-05"]);
    const bad = reportRange({ from: "nonsense", to: "2026-02-30" }, now);
    expect([bad.from, bad.to]).toEqual(["2026-10-01", "2026-10-11"]);
  });

  it("a single day works", () => {
    const r = reportRange({ from: "2026-10-03", to: "2026-10-03" }, now);
    expect(r.end.getTime() - r.start.getTime()).toBe(86_400_000);
  });
});

describe("inRange at IST midnight", () => {
  const r = reportRange({ from: "2026-10-02", to: "2026-10-02" });
  it("23:59 IST the day before is out, 00:00 IST is in", () => {
    expect(inRange("2026-10-01T18:29:59Z", r)).toBe(false);
    expect(inRange("2026-10-01T18:30:00Z", r)).toBe(true);
  });
  it("23:59:59 IST of the last day is in, the next midnight is out", () => {
    expect(inRange("2026-10-02T18:29:59Z", r)).toBe(true);
    expect(inRange("2026-10-02T18:30:00Z", r)).toBe(false);
  });
  it("istStartOf is 18:30 UTC the day before", () => {
    expect(istStartOf("2026-10-02").toISOString()).toBe("2026-10-01T18:30:00.000Z");
  });
});

describe("helpers", () => {
  it("rangeQuery and param", () => {
    expect(rangeQuery({ from: "2026-10-01", to: "2026-10-09" })).toBe("from=2026-10-01&to=2026-10-09");
    expect(param("x")).toBe("x");
    expect(param(["a", "b"])).toBe("");
    expect(param(undefined)).toBe("");
  });
});

describe("optionalRange", () => {
  it("empty means no limit", () => {
    expect(optionalRange({})).toEqual({ from: "", to: "", start: null, end: null });
  });
  it("one end only", () => {
    const r = optionalRange({ to: "2026-10-02" });
    expect(r.start).toBeNull();
    expect(r.end?.toISOString()).toBe("2026-10-02T18:30:00.000Z");
  });
  it("swaps a backwards pair and ignores bad days", () => {
    expect(optionalRange({ from: "2026-10-05", to: "2026-10-01" })).toMatchObject({ from: "2026-10-01", to: "2026-10-05" });
    expect(optionalRange({ from: "2026-02-30" }).from).toBe("");
  });
});

describe("pageParam", () => {
  it("reads a whole page number", () => {
    expect(pageParam("3")).toBe(3);
    expect(pageParam("-1")).toBe(0);
    expect(pageParam("abc")).toBe(0);
    expect(pageParam(undefined)).toBe(0);
    expect(pageParam("99999999")).toBe(10_000);
  });
});
