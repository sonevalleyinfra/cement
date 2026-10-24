import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatDayMonth, toISTDateKey } from "./datetime";

// 20:00 UTC on 15 Jan is already 01:30 on 16 Jan in India (UTC+5:30).
const lateEveningUtc = new Date("2026-01-15T20:00:00Z");

describe("dates are shown in Asia/Kolkata", () => {
  it("formatDate uses the Indian calendar day", () => {
    expect(formatDate(lateEveningUtc)).toBe("16 Jan 2026");
  });

  it("formatDayMonth drops the year, IST day", () => {
    expect(formatDayMonth(lateEveningUtc)).toBe("16 Jan");
  });

  it("formatDateTime shows IST time", () => {
    expect(formatDateTime(lateEveningUtc)).toBe("16 Jan 2026, 1:30 am");
  });

  it("toISTDateKey gives the IST calendar date", () => {
    expect(toISTDateKey(lateEveningUtc)).toBe("2026-01-16");
    expect(toISTDateKey("2026-01-15T18:29:59Z")).toBe("2026-01-15");
    expect(toISTDateKey("2026-01-15T18:30:00Z")).toBe("2026-01-16");
  });
});
