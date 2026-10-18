import { describe, expect, it } from "vitest";
import {
  formatINR,
  mulDivRound,
  formatINRCompact,
  parseRupeesToPaise,
  percentOf,
  rupeesToPaise,
  splitPaise,
} from "./money";

describe("formatINR", () => {
  it("formats paise as rupees with lakh/crore grouping", () => {
    expect(formatINR(12345678)).toBe("₹1,23,456.78");
    expect(formatINR(1234567890)).toBe("₹1,23,45,678.90");
    expect(formatINR(0)).toBe("₹0.00");
    expect(formatINR(50)).toBe("₹0.50");
    expect(formatINR(-500)).toBe("−₹5.00");
  });

  it("writes negatives with the true minus sign and no space", () => {
    expect(formatINR(-15_000_00)).toBe("−₹15,000.00");
    expect(formatINR(-5000, { hidePaise: true })).toBe("−₹50");
    expect(formatINR(-15_000_50, { hidePaise: true })).toBe("−₹15,000.50");
  });

  it("never shows a sign on zero, even -0", () => {
    expect(formatINR(-0)).toBe("₹0.00");
    expect(formatINR(0, { hidePaise: true })).toBe("₹0");
    expect(formatINR(-0, { hidePaise: true })).toBe("₹0");
  });

  it("can hide .00 on whole rupees", () => {
    expect(formatINR(1_00_000_00, { hidePaise: true })).toBe("₹1,00,000");
    expect(formatINR(-50_00, { hidePaise: true })).toBe("−₹50");
  });

  it("never rounds real paise away, even with hidePaise", () => {
    expect(formatINR(36_99_950, { hidePaise: true })).toBe("₹36,999.50");
    expect(formatINR(1, { hidePaise: true })).toBe("₹0.01");
    expect(formatINR(-99, { hidePaise: true })).toBe("−₹0.99");
  });

  it("rejects non-integer amounts", () => {
    expect(() => formatINR(10.5)).toThrow(TypeError);
  });
});

describe("formatINRCompact", () => {
  it("uses lakh and crore words", () => {
    expect(formatINRCompact(1_50_000_00)).toBe("₹1.5 lakh");
    expect(formatINRCompact(2_50_00_000_00)).toBe("₹2.5 crore");
    expect(formatINRCompact(-1_00_000_00)).toBe("−₹1 lakh");
    expect(formatINRCompact(-2_50_00_000_00)).toBe("−₹2.5 crore");
    expect(formatINRCompact(-500_00)).toBe("−₹500.00");
  });

  it("falls back to the full format below one lakh", () => {
    expect(formatINRCompact(99_999_00)).toBe("₹99,999.00");
  });
});

describe("rupeesToPaise", () => {
  it("multiplies whole rupees by 100", () => {
    expect(rupeesToPaise(250)).toBe(25000);
  });

  it("refuses fractional rupees", () => {
    expect(() => rupeesToPaise(1.5)).toThrow(TypeError);
  });
});

describe("parseRupeesToPaise", () => {
  it("parses what people type", () => {
    expect(parseRupeesToPaise("1,23,456.78")).toBe(12345678);
    expect(parseRupeesToPaise("₹ 500")).toBe(50000);
    expect(parseRupeesToPaise("Rs. 99.5")).toBe(9950);
    expect(parseRupeesToPaise("-20")).toBe(-2000);
    expect(parseRupeesToPaise("0.1")).toBe(10);
  });

  it("does not suffer from floating-point errors", () => {
    expect(parseRupeesToPaise("1.15")).toBe(115); // 1.15 * 100 = 114.99999999999999 in JS
  });

  it("returns null for invalid input", () => {
    expect(parseRupeesToPaise("")).toBeNull();
    expect(parseRupeesToPaise("abc")).toBeNull();
    expect(parseRupeesToPaise("1.234")).toBeNull();
    expect(parseRupeesToPaise("1.2.3")).toBeNull();
  });
});

describe("splitPaise", () => {
  it("splits without losing a paisa", () => {
    expect(splitPaise(100, 3)).toEqual([34, 33, 33]);
    expect(splitPaise(-100, 3)).toEqual([-34, -33, -33]);
    expect(splitPaise(90, 3)).toEqual([30, 30, 30]);
  });

  it("always adds back up to the total", () => {
    for (const total of [1, 99, 1001, 123457]) {
      for (const parts of [1, 2, 3, 7]) {
        expect(splitPaise(total, parts).reduce((a, b) => a + b, 0)).toBe(total);
      }
    }
  });

  it("rejects invalid parts", () => {
    expect(() => splitPaise(100, 0)).toThrow(RangeError);
  });
});

describe("percentOf", () => {
  it("computes 18% GST in paise, rounding to the nearest paisa", () => {
    expect(percentOf(99999, 1800)).toBe(18000); // 17999.82 → 18000
    expect(percentOf(10000, 1800)).toBe(1800);
  });

  it("rounds halves away from zero", () => {
    expect(percentOf(50, 100)).toBe(1); // 0.5 → 1
    expect(percentOf(-50, 100)).toBe(-1);
    expect(Object.is(percentOf(-1, 100), 0)).toBe(true); // no -0
  });
});

describe("mulDivRound", () => {
  it("multiplies then divides exactly", () => {
    expect(mulDivRound(3, 28_000, 1)).toBe(84_000);
    expect(mulDivRound(10, 57_500, 2)).toBe(287_500);
  });
  it("rounds half away from zero", () => {
    expect(mulDivRound(1, 5, 2)).toBe(3);
    expect(mulDivRound(1, 7, 3)).toBe(2);
    expect(mulDivRound(1, 8, 3)).toBe(3);
    expect(mulDivRound(-1, 5, 2)).toBe(-3);
    expect(mulDivRound(1, -7, 3)).toBe(-2);
    expect(mulDivRound(0, 5, 3)).toBe(0);
    expect(Object.is(mulDivRound(-1, 1, 3), 0)).toBe(true);
  });
  it("stays exact when the product is beyond 2^53", () => {
    // 90,000 bags x ₹1,000 crore total cost / 1,00,000 bags
    expect(mulDivRound(90_000, 1_000_000_000_000, 100_000)).toBe(900_000_000_000);
  });
  it("refuses fractions and divide by zero", () => {
    expect(() => mulDivRound(1.5, 2, 3)).toThrow();
    expect(() => mulDivRound(1, 2, 0)).toThrow();
  });
});
