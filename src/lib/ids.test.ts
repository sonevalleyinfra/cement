import { afterEach, describe, expect, it, vi } from "vitest";
import { isUuid, newRequestId } from "./ids";

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

describe("newRequestId", () => {
  afterEach(() => vi.restoreAllMocks());

  it("makes a valid uuid, different every time", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newRequestId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(isUuid(id)).toBe(true);
  });

  it("still works where randomUUID is refused (plain http)", () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(() => {
      throw new Error("not a secure context");
    });
    const id = newRequestId();
    expect(isUuid(id)).toBe(true);
    expect(id[14]).toBe("4");
  });
});
