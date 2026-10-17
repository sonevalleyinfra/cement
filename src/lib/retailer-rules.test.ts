import { describe, expect, it } from "vitest";
import {
  isValidIndianMobile,
  matchesRetailerSearch,
  normalizePhone,
  pickableRetailerLogins,
  pickPrefillRetailerId,
  planShopEdit,
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

describe("planShopEdit", () => {
  const shop = { id: "r1", salesRepId: "s1", userId: null };
  const form = { name: " Shree  Traders ", phone: "+91 98765 43210", place: "Hubli" };
  const facts = { phoneTaken: false, loginLinks: [] };
  const rep = { id: "s2", role: "sales", banned: false, deletedAt: null };
  const login = { id: "u9", role: "retailer" };

  it("details only: cleaned, nothing else changes", () => {
    expect(planShopEdit(shop, form, facts)).toEqual({
      ok: true,
      details: { name: "Shree Traders", phone: "9876543210", place: "Hubli" },
      salesRepId: null,
      userId: undefined,
    });
  });
  it("a bad name or phone, or a phone of another shop, refuses everything", () => {
    expect(planShopEdit(shop, { ...form, name: " " }, facts)).toEqual({ ok: false, error: "Enter a name" });
    expect(planShopEdit(shop, { ...form, phone: "123" }, facts)).toEqual({ ok: false, error: "Enter a 10-digit mobile" });
    expect(planShopEdit(shop, { ...form, salesRepId: "s2" }, { ...facts, salesRep: rep, phoneTaken: true })).toEqual({
      ok: false,
      error: "Phone already used",
    });
  });
  it("a new sales person must be an active sales person", () => {
    const ok = planShopEdit(shop, { ...form, salesRepId: "s2" }, { ...facts, salesRep: rep });
    expect(ok.ok && ok.salesRepId).toBe("s2");
    expect(planShopEdit(shop, { ...form, salesRepId: "s2" }, { ...facts, salesRep: { ...rep, banned: true } })).toEqual({
      ok: false,
      error: "Pick an active sales person.",
    });
    expect(planShopEdit(shop, { ...form, salesRepId: "s2" }, facts).ok).toBe(false);
  });
  it("the same (or no) sales person is no change, even if they have left", () => {
    for (const salesRepId of ["s1", "", undefined]) {
      const plan = planShopEdit(shop, { ...form, salesRepId }, facts);
      expect(plan.ok && plan.salesRepId).toBeNull();
    }
  });
  it("a login must be a retailer login not linked to another shop", () => {
    const ok = planShopEdit(shop, { ...form, userId: "u9" }, { ...facts, login });
    expect(ok.ok && ok.userId).toBe("u9");
    expect(planShopEdit(shop, { ...form, userId: "u9" }, { ...facts, login: { ...login, role: "sales" } })).toEqual({
      ok: false,
      error: "Pick a user with the retailer role.",
    });
    expect(
      planShopEdit(shop, { ...form, userId: "u9" }, { ...facts, login, loginLinks: [{ retailerId: "r2", userId: "u9" }] }),
    ).toEqual({ ok: false, error: "That login is already linked to another retailer." });
  });
  it("a failing login refuses the sales person change too (all or nothing)", () => {
    const plan = planShopEdit(
      shop,
      { ...form, salesRepId: "s2", userId: "u9" },
      { ...facts, salesRep: rep, login, loginLinks: [{ retailerId: "r2", userId: "u9" }] },
    );
    expect(plan.ok).toBe(false);
  });
  it("empty login unlinks; the same login is no change", () => {
    const linked = { ...shop, userId: "u9" };
    const unlink = planShopEdit(linked, { ...form, userId: null }, facts);
    expect(unlink.ok && unlink.userId).toBeNull();
    const same = planShopEdit(linked, { ...form, userId: "u9" }, facts);
    expect(same.ok && same.userId).toBeUndefined();
  });
});

describe("pickPrefillRetailerId", () => {
  const allowed = [{ id: "a1" }, { id: "b2" }];
  it("accepts an id the user may pick", () => {
    expect(pickPrefillRetailerId("b2", allowed)).toBe("b2");
  });
  it("ignores an id the user cannot access", () => {
    expect(pickPrefillRetailerId("zzz", allowed)).toBeNull();
  });
  it("ignores missing, empty and repeated params", () => {
    expect(pickPrefillRetailerId(undefined, allowed)).toBeNull();
    expect(pickPrefillRetailerId("", allowed)).toBeNull();
    expect(pickPrefillRetailerId(["a1", "b2"], allowed)).toBeNull();
  });
  it("ignores everything when the list is empty", () => {
    expect(pickPrefillRetailerId("a1", [])).toBeNull();
  });
});
