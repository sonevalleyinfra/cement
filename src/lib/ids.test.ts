import { describe, expect, it } from "vitest";
import { isUuid } from "./ids";

describe("isUuid", () => {
  it("accepts a normal uuid", () => {
    expect(isUuid("3f2b6c1e-8a4d-4f7e-9b1a-2c3d4e5f6a7b")).toBe(true);
    expect(isUuid("3F2B6C1E-8A4D-4F7E-9B1A-2C3D4E5F6A7B")).toBe(true);
  });
  it("refuses anything else", () => {
    expect(isUuid("")).toBe(false);
    expect(isUuid("abc")).toBe(false);
    expect(isUuid("------------------------------------")).toBe(false);
    expect(isUuid("3f2b6c1e-8a4d-4f7e-9b1a-2c3d4e5f6a7b' or 1=1")).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(42)).toBe(false);
  });
});
