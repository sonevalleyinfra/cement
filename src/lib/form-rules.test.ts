import { describe, expect, it } from "vitest";
import { errorKey, firstMissing, visibleError } from "./form-rules";

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
