import { describe, expect, it } from "vitest";
import {
  isValidIndianMobile,
  matchesRetailerSearch,
  normalizePhone,
  pickableRetailerLogins,
  type RetailerLogin,
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

const login = (over: Partial<RetailerLogin> = {}): RetailerLogin => ({
  id: "u1",
  name: "Sharma Traders",
  email: "sharma@example.com",
  phone: "9876543210",
  role: "retailer",
  banned: false,
  deletedAt: null,
  ...over,
});

describe("pickableRetailerLogins", () => {
  it("keeps active retailer logins", () => expect(pickableRetailerLogins([login()], [])).toHaveLength(1));
  it("drops other roles", () => expect(pickableRetailerLogins([login({ role: "sales" })], [])).toEqual([]));
  it("drops deactivated users", () => expect(pickableRetailerLogins([login({ banned: true })], [])).toEqual([]));
  it("drops deleted users", () =>
    expect(pickableRetailerLogins([login({ deletedAt: new Date() })], [])).toEqual([]));
  it("drops logins already linked to a shop", () =>
    expect(pickableRetailerLogins([login()], [null, "u1"])).toEqual([]));
});

describe("matchesRetailerSearch", () => {
  const shop = { name: "Sharma Building Supplies", place: "Patna", phone: "9876543210" };
  it("matches name, place or phone, ignoring capitals", () => {
    expect(matchesRetailerSearch(shop, "sharma")).toBe(true);
    expect(matchesRetailerSearch(shop, "PATNA")).toBe(true);
    expect(matchesRetailerSearch(shop, "76543")).toBe(true);
  });
  it("needs every word to match", () => {
    expect(matchesRetailerSearch(shop, "sharma patna")).toBe(true);
    expect(matchesRetailerSearch(shop, "sharma gaya")).toBe(false);
  });
  it("an empty search shows everything", () => {
    expect(matchesRetailerSearch(shop, "")).toBe(true);
    expect(matchesRetailerSearch(shop, "   ")).toBe(true);
  });
  it("finds nothing for an unknown word", () => {
    expect(matchesRetailerSearch(shop, "zzz")).toBe(false);
  });
});
