import { describe, expect, it } from "vitest";
import {
  deviationText,
  lastRateText,
  pickLastRate,
  RATE_DEVIATION_PAISE,
  rateDeviation,
  stockHint,
  weekRange,
} from "./rate-hint-rules";

describe("pickLastRate", () => {
  it("picks the latest", () => {
    const at = (iso: string) => new Date(iso);
    expect(
      pickLastRate([
        { ratePaise: 34000, at: at("2026-10-10T10:00:00Z") },
        { ratePaise: 35300, at: at("2026-10-12T10:00:00Z") },
        { ratePaise: 34800, at: at("2026-10-11T10:00:00Z") },
      ]),
    ).toEqual({ ratePaise: 35300, at: at("2026-10-12T10:00:00Z") });
  });

  it("is null with no rates", () => {
    expect(pickLastRate([])).toBeNull();
  });
});

describe("weekRange", () => {
  it("gives min and max", () => {
    expect(weekRange([36000, 34800, 35300])).toEqual({ minPaise: 34800, maxPaise: 36000 });
  });

  it("is null with no rates", () => {
    expect(weekRange([])).toBeNull();
  });
});

describe("rateDeviation", () => {
  it("warns only above ₹10", () => {
    expect(RATE_DEVIATION_PAISE).toBe(1000);
    expect(rateDeviation(35000 - 1000, 35000)).toBeNull();
    expect(rateDeviation(35000 + 1000, 35000)).toBeNull();
    expect(rateDeviation(35000 - 1001, 35000)).toEqual({ dir: "below", diffPaise: 1001 });
    expect(rateDeviation(35000 + 1001, 35000)).toEqual({ dir: "above", diffPaise: 1001 });
  });

  it("is null with no last rate", () => {
    expect(rateDeviation(10000, null)).toBeNull();
  });
});

describe("deviationText", () => {
  it("whole rupees, or paise when there are some", () => {
    expect(deviationText({ dir: "below", diffPaise: 1800 })).toBe("₹18 below last rate");
    expect(deviationText({ dir: "above", diffPaise: 1200 })).toBe("₹12 above last rate");
    expect(deviationText({ dir: "above", diffPaise: 1250 })).toBe("₹12.50 above last rate");
  });
});

describe("lastRateText", () => {
  const last = { ratePaise: 35300, atIso: "2026-10-12T06:00:00Z" };
  const week = { minPaise: 34800, maxPaise: 36000 };

  it("shows last and week", () => {
    expect(lastRateText({ last, week })).toBe("Last ₹353 · 12 Oct · Week ₹348–360");
  });

  it("shows either alone", () => {
    expect(lastRateText({ last, week: null })).toBe("Last ₹353 · 12 Oct");
    expect(lastRateText({ last: null, week })).toBe("Week ₹348–360");
  });

  it("one rate in the week shows once", () => {
    expect(lastRateText({ last: null, week: { minPaise: 35000, maxPaise: 35000 } })).toBe("Week ₹350");
  });

  it("is empty with no data", () => {
    expect(lastRateText({ last: null, week: null })).toBe("");
    expect(lastRateText(null)).toBe("");
  });
});

describe("stockHint", () => {
  it("muted when enough", () => {
    expect(stockHint(1240, 100)).toEqual({ tone: "muted", text: "1,240 bags in stock" });
    expect(stockHint(1240, 1240)).toEqual({ tone: "muted", text: "1,240 bags in stock" });
    expect(stockHint(1, 0)).toEqual({ tone: "muted", text: "1 bag in stock" });
  });

  it("caution when short", () => {
    expect(stockHint(1240, 1241)).toEqual({ tone: "caution", text: "Only 1,240 bags in stock" });
  });

  it("caution when out", () => {
    expect(stockHint(0, 0)).toEqual({ tone: "caution", text: "Out of stock" });
    expect(stockHint(-5, 10)).toEqual({ tone: "caution", text: "Out of stock" });
  });
});
