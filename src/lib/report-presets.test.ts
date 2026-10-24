import { describe, expect, it } from "vitest";
import { matchPreset, PRESETS, presetRange } from "./report-presets";

const at = (iso: string) => new Date(iso);

describe("presetRange", () => {
  it("today and yesterday follow the India day, not the UTC day", () => {
    // 18:30 UTC on 31 Mar is 00:00 on 1 Apr in India.
    const now = at("2026-03-31T18:30:00Z");
    expect(presetRange("today", now)).toEqual({ from: "2026-04-01", to: "2026-04-01" });
    expect(presetRange("yesterday", now)).toEqual({ from: "2026-03-31", to: "2026-03-31" });
    // 18:29 UTC is still 31 Mar in India.
    expect(presetRange("today", at("2026-03-31T18:29:00Z"))).toEqual({ from: "2026-03-31", to: "2026-03-31" });
  });

  it("this week runs Monday to today", () => {
    // 2026-10-26 is a Monday, 2026-11-01 a Sunday.
    expect(presetRange("this_week", at("2026-10-26T10:00:00+05:30"))).toEqual({ from: "2026-10-26", to: "2026-10-26" });
    expect(presetRange("this_week", at("2026-10-28T10:00:00+05:30"))).toEqual({ from: "2026-10-26", to: "2026-10-28" });
    expect(presetRange("this_week", at("2026-11-01T10:00:00+05:30"))).toEqual({ from: "2026-10-26", to: "2026-11-01" });
  });

  it("this week crosses a month and year edge", () => {
    // Fri 1 Jan 2027 -> Monday 28 Dec 2026.
    expect(presetRange("this_week", at("2027-01-01T09:00:00+05:30"))).toEqual({ from: "2026-12-28", to: "2027-01-01" });
  });

  it("this week uses the India day when UTC is still Sunday", () => {
    // Sunday 18:30 UTC is Monday 00:00 in India.
    expect(presetRange("this_week", at("2026-10-25T18:30:00Z"))).toEqual({ from: "2026-10-26", to: "2026-10-26" });
  });

  it("this month is the 1st to today", () => {
    expect(presetRange("mtd", at("2026-10-24T12:00:00+05:30"))).toEqual({ from: "2026-10-01", to: "2026-10-24" });
    expect(presetRange("mtd", at("2026-03-31T18:30:00Z"))).toEqual({ from: "2026-04-01", to: "2026-04-01" });
  });

  it("last month is the full previous month", () => {
    expect(presetRange("last_month", at("2026-10-24T12:00:00+05:30"))).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(presetRange("last_month", at("2026-01-01T00:00:00+05:30"))).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(presetRange("last_month", at("2028-03-01T00:00:00+05:30"))).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(presetRange("last_month", at("2027-03-01T00:00:00+05:30"))).toEqual({ from: "2027-02-01", to: "2027-02-28" });
  });

  it("financial year switches on 1 April India time", () => {
    const before = at("2026-03-31T23:59:00+05:30");
    expect(presetRange("this_fy", before)).toEqual({ from: "2025-04-01", to: "2026-03-31" });
    expect(presetRange("last_fy", before)).toEqual({ from: "2024-04-01", to: "2025-03-31" });
    const after = at("2026-04-01T00:00:00+05:30");
    expect(presetRange("this_fy", after)).toEqual({ from: "2026-04-01", to: "2026-04-01" });
    expect(presetRange("last_fy", after)).toEqual({ from: "2025-04-01", to: "2026-03-31" });
    expect(presetRange("this_fy", at("2026-03-31T18:30:00Z"))).toEqual({ from: "2026-04-01", to: "2026-04-01" });
  });

  it("this FY ends today, not at the future 31 March", () => {
    expect(presetRange("this_fy", at("2026-10-24T12:00:00+05:30"))).toEqual({ from: "2026-04-01", to: "2026-10-24" });
    expect(presetRange("this_fy", at("2027-01-01T12:00:00+05:30"))).toEqual({ from: "2026-04-01", to: "2027-01-01" });
  });

  it("handles a leap day", () => {
    expect(presetRange("yesterday", at("2028-03-01T10:00:00+05:30"))).toEqual({ from: "2028-02-29", to: "2028-02-29" });
    expect(presetRange("today", at("2028-02-29T10:00:00+05:30"))).toEqual({ from: "2028-02-29", to: "2028-02-29" });
  });
});

describe("matchPreset", () => {
  const now = at("2026-10-24T12:00:00+05:30");
  it("finds the preset a range equals", () => {
    for (const id of PRESETS) expect(matchPreset(presetRange(id, now), now)).toBeTruthy();
    expect(matchPreset({ from: "2026-10-01", to: "2026-10-24" }, now)).toBe("mtd");
  });
  it("returns null for a custom range", () => {
    expect(matchPreset({ from: "2026-10-02", to: "2026-10-24" }, now)).toBeNull();
  });
});
