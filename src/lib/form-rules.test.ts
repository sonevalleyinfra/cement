import { describe, expect, it } from "vitest";
import { errorKey, firstMissing, pressKey, visibleError } from "./form-rules";
import { parseRupeesToPaise } from "./money";

describe("errorKey", () => {
  it("is the same for the same values and different when a value changes", () => {
    expect(errorKey(["a", 50])).toBe(errorKey(["a", 50]));
    expect(errorKey(["a", 50])).not.toBe(errorKey(["a", 5]));
    expect(errorKey(["", null])).not.toBe(errorKey(["x", null]));
  });
  it("does not throw on values that cannot be written out", () => {
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(errorKey(loop)).toBe("");
    expect(errorKey(undefined)).toBe("");
  });
});

describe("visibleError", () => {
  const key = errorKey(["", "BR01"]);
  const stored = { message: "Enter the number of bags.", key };
  it("shows the error while the values are the same", () => {
    expect(visibleError(stored, key)).toBe("Enter the number of bags.");
  });
  it("hides it once a watched value changed (the person fixed the field)", () => {
    expect(visibleError(stored, errorKey(["50", "BR01"]))).toBe("");
  });
  it("shows nothing when there is no error", () => {
    expect(visibleError(null, key)).toBe("");
  });
});

describe("firstMissing", () => {
  it("returns the first missing hint in order", () => {
    expect(
      firstMissing([
        [false, "Pick a retailer"],
        [true, "Enter the amount"],
        [true, "Enter the UTR"],
      ]),
    ).toBe("Enter the amount");
  });
  it("returns null when nothing is missing", () => {
    expect(firstMissing([[false, "Pick a retailer"]])).toBeNull();
    expect(firstMissing([])).toBeNull();
  });
});

describe("pressKey (on-screen keypad)", () => {
  const type = (keys: string[], opts?: { maxLength?: number; decimal?: boolean }) =>
    keys.reduce((v, k) => pressKey(v, k, opts), "");
  it("whole numbers: digits and 00, no leading zero, capped length", () => {
    expect(type(["0", "5"])).toBe("5");
    expect(type(["1", "00"])).toBe("100");
    expect(type(["1", "2", "3", "4"], { maxLength: 3 })).toBe("123");
    expect(type(["1", "."])).toBe("1");
    expect(type(["1", "2", "del"])).toBe("1");
  });
  it("payments: rupees and paise, up to 2 digits after the point", () => {
    const text = type(["9", "0", "2", "3", ".", "4", "5", "6"], { decimal: true });
    expect(text).toBe("9023.45");
    expect(parseRupeesToPaise(text)).toBe(902345);
    expect(type([".", "5"], { decimal: true })).toBe("0.5");
    expect(type(["1", ".", "."], { decimal: true })).toBe("1.");
    expect(type(["1", ".", "5", "del", "del"], { decimal: true })).toBe("1");
  });
  it("the length cap counts whole rupees only", () => {
    expect(type(["1", "2", "3", ".", "4", "5"], { maxLength: 3, decimal: true })).toBe("123.45");
    expect(type(["1", "2", "3", "4"], { maxLength: 3, decimal: true })).toBe("123");
  });
});
