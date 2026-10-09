import { describe, expect, it } from "vitest";
import {
  isDuplicatePhone,
  isValidIndianMobile,
  normalizePhone,
  validateRetailer,
} from "./retailer-rules";

describe("normalizePhone", () => {
  it("keeps digits only", () => expect(normalizePhone("98765 43210")).toBe("9876543210"));
  it("drops +91", () => expect(normalizePhone("+91 98765-43210")).toBe("9876543210"));
  it("drops leading 0", () => expect(normalizePhone("09876543210")).toBe("9876543210"));
});

describe("isValidIndianMobile", () => {
  it("accepts 10 digits starting 6-9", () => expect(isValidIndianMobile("6876543210")).toBe(true));
  it("rejects starting with 5", () => expect(isValidIndianMobile("5876543210")).toBe(false));
  it("rejects wrong length", () => {
    expect(isValidIndianMobile("987654321")).toBe(false);
    expect(isValidIndianMobile("98765432101")).toBe(false);
  });
});

describe("validateRetailer", () => {
  it("trims and normalises", () => {
    expect(validateRetailer({ name: "  Ram   Traders ", phone: "+919876543210", place: " Pune " })).toEqual({
      ok: true,
      value: { name: "Ram Traders", phone: "9876543210", place: "Pune" },
    });
  });
  it("requires a name", () => {
    const r = validateRetailer({ name: "   ", phone: "9876543210" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.name).toBeDefined();
  });
  it("rejects a bad phone", () => {
    const r = validateRetailer({ name: "A", phone: "123" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.phone).toBeDefined();
  });
  it("allows empty place", () => {
    expect(validateRetailer({ name: "A", phone: "9876543210" }).ok).toBe(true);
  });
});

describe("isDuplicatePhone", () => {
  const list = [{ id: "1", phone: "9876543210" }];
  it("finds a duplicate", () => expect(isDuplicatePhone("9876543210", list)).toBe(true));
  it("ignores itself when editing", () => expect(isDuplicatePhone("9876543210", list, "1")).toBe(false));
  it("passes a new number", () => expect(isDuplicatePhone("9876543211", list)).toBe(false));
});
