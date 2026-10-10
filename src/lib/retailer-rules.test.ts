import { describe, expect, it } from "vitest";
import {
  checkRetailerPick,
  isDuplicatePhone,
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

describe("isDuplicatePhone", () => {
  const list = [{ id: "1", phone: "9876543210" }];
  it("finds a duplicate", () => expect(isDuplicatePhone("9876543210", list)).toBe(true));
  it("ignores itself when editing", () => expect(isDuplicatePhone("9876543210", list, "1")).toBe(false));
  it("passes a new number", () => expect(isDuplicatePhone("9876543211", list)).toBe(false));
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
  const l = login();
  it("matches everything when empty", () => expect(matchesRetailerSearch(l, "  ")).toBe(true));
  it("matches name, any case", () => expect(matchesRetailerSearch(l, "sharma t")).toBe(true));
  it("matches email", () => expect(matchesRetailerSearch(l, "@EXAMPLE")).toBe(true));
  it("matches part of the phone", () => expect(matchesRetailerSearch(l, "54321")).toBe(true));
  it("matches a phone typed with +91 and spaces", () =>
    expect(matchesRetailerSearch(l, "+91 98765 43210")).toBe(true));
  it("rejects a non-match", () => expect(matchesRetailerSearch(l, "gupta")).toBe(false));
  it("rejects wrong digits", () => expect(matchesRetailerSearch(l, "1111")).toBe(false));
});

describe("checkRetailerPick", () => {
  it("accepts a free retailer login", () => expect(checkRetailerPick(login(), [])).toEqual({ ok: true }));
  it("rejects a missing login", () => expect(checkRetailerPick(undefined, []).ok).toBe(false));
  it("rejects a non-retailer", () => expect(checkRetailerPick(login({ role: "accounts" }), []).ok).toBe(false));
  it("rejects a deactivated login", () => expect(checkRetailerPick(login({ banned: true }), []).ok).toBe(false));
  it("rejects a login already added", () =>
    expect(checkRetailerPick(login(), ["u1"])).toEqual({ ok: false, error: "This retailer is already added." }));
  it("rejects a login with no phone", () => expect(checkRetailerPick(login({ phone: "" }), []).ok).toBe(false));
});
