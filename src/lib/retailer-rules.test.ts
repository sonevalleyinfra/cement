import { describe, expect, it } from "vitest";
import {
  groupPickerRetailers,
  retailerInScope,
  isValidIndianMobile,
  matchesRetailerSearch,
  normalizePhone,
  pickableRetailerLogins,
  pickPrefillRetailerId,
  planShopEdit,
  retailerMeta,
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
  it("also matches the area name and the owner name", () => {
    const full = { ...shop, areaName: "North Bihar", ownerName: "Ramesh Sharma" };
    expect(matchesRetailerSearch(full, "north")).toBe(true);
    expect(matchesRetailerSearch(full, "ramesh bihar")).toBe(true);
    expect(matchesRetailerSearch(shop, "north")).toBe(false);
    expect(matchesRetailerSearch({ ...shop, areaName: null, ownerName: null }, "null")).toBe(false);
  });
});

describe("planShopEdit", () => {
  const shop = { id: "r1", salesRepId: "s1", userId: null };
  const form = { name: " Shree  Traders ", phone: "+91 98765 43210", place: "Hubli" };
  const facts = { phoneTaken: false, loginLinks: [], today: "2026-10-24" };
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

describe("planShopEdit: master and credit parts", () => {
  const shop = {
    id: "r1",
    salesRepId: "s1",
    userId: null,
    areaId: "a1",
    creditLimitPaise: null,
    creditDays: null,
    creditStatus: "ok",
  };
  const form = { name: "Shree Traders", phone: "9876543210", place: "Patna" };
  const facts = { phoneTaken: false, loginLinks: [], today: "2026-10-24" };
  const master = {
    ownerName: " Ram  Prasad ",
    altPhone: "9123456789",
    address: "Ashok Rajpath",
    areaId: "a1",
    pincode: "800004",
    lat: 25.6123456789,
    lng: 85.1,
    category: "retailer",
    openedOn: "2015-04-01",
    gstin: "10aabcs1429b1z9",
  };
  const credit = { limit: "2,00,000", days: "45", status: "hold", note: "new shop" };

  it("parts left out are not touched", () => {
    const plan = planShopEdit(shop, form, facts);
    expect(plan.ok && plan.master).toBeUndefined();
    expect(plan.ok && plan.credit).toBeUndefined();
  });
  it("cleans the master part", () => {
    const plan = planShopEdit(shop, { ...form, master }, facts);
    expect(plan.ok && plan.master).toEqual({
      ownerName: "Ram Prasad",
      altPhone: "9123456789",
      address: "Ashok Rajpath",
      areaId: "a1",
      pincode: "800004",
      lat: 25.612346,
      lng: 85.1,
      category: "retailer",
      openedOn: "2015-04-01",
      gstin: "10AABCS1429B1Z9",
    });
  });
  it("alt phone is checked against the phone being saved", () => {
    expect(planShopEdit(shop, { ...form, phone: "9123456789", master }, facts)).toEqual({
      ok: false,
      error: "Alt phone is the same as phone",
    });
  });
  it("the opening date is checked against today", () => {
    expect(planShopEdit(shop, { ...form, master: { ...master, openedOn: "2026-10-25" } }, facts)).toEqual({
      ok: false,
      error: "Opening date can't be in the future",
    });
  });
  it("an unchanged area is kept even when off; a changed one must be on", () => {
    expect(planShopEdit(shop, { ...form, master }, facts).ok).toBe(true);
    const moved = { ...form, master: { ...master, areaId: "a2" } };
    expect(planShopEdit(shop, moved, { ...facts, area: { id: "a2", active: false } })).toEqual({
      ok: false,
      error: "Pick an active area",
    });
    expect(planShopEdit(shop, moved, facts).ok).toBe(false);
    const ok = planShopEdit(shop, moved, { ...facts, area: { id: "a2", active: true } });
    expect(ok.ok && ok.master?.areaId).toBe("a2");
    const cleared = planShopEdit(shop, { ...form, master: { ...master, areaId: "" } }, facts);
    expect(cleared.ok && cleared.master?.areaId).toBeNull();
  });
  it("plans the credit terms and one history row", () => {
    const plan = planShopEdit(shop, { ...form, credit }, facts);
    expect(plan.ok && plan.credit).toEqual({
      terms: { limitPaise: 20_000_000, creditDays: 45, status: "hold" },
      change: {
        oldLimitPaise: null,
        newLimitPaise: 20_000_000,
        oldCreditDays: null,
        newCreditDays: 45,
        oldStatus: "ok",
        newStatus: "hold",
        note: "new shop",
      },
    });
  });
  it("same credit terms: no history row", () => {
    const set = { ...shop, creditLimitPaise: 20_000_000, creditDays: 45, creditStatus: "hold" };
    const plan = planShopEdit(set, { ...form, credit }, facts);
    expect(plan.ok && plan.credit?.change).toBeNull();
  });
  it("one bad part refuses the whole save (all or nothing)", () => {
    expect(planShopEdit(shop, { ...form, master: { ...master, pincode: "12" }, credit }, facts)).toEqual({
      ok: false,
      error: "Enter a 6-digit pincode",
    });
    expect(planShopEdit(shop, { ...form, master, credit: { ...credit, days: "400" } }, facts)).toEqual({
      ok: false,
      error: "Credit days must be 0 to 365",
    });
    expect(planShopEdit(shop, { ...form, name: "", master, credit }, facts)).toEqual({ ok: false, error: "Enter a name" });
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

describe("retailerMeta", () => {
  it("shows the place for a switched-on shop", () => {
    expect(retailerMeta({ place: "Patna", active: true })).toBe("Patna");
  });
  it("adds Off for a switched-off shop", () => {
    expect(retailerMeta({ place: "Patna", active: false })).toBe("Patna · Off");
  });
  it("handles a shop with no place", () => {
    expect(retailerMeta({ place: "", active: false })).toBe("Off");
    expect(retailerMeta({ place: "", active: true })).toBe("");
  });
});

describe("retailerInScope", () => {
  it("Mine is the shops assigned to this person; All is every shop", () => {
    expect(retailerInScope({ salesRepId: "me" }, "mine", "me")).toBe(true);
    expect(retailerInScope({ salesRepId: "other" }, "mine", "me")).toBe(false);
    expect(retailerInScope({ salesRepId: null }, "mine", "me")).toBe(false);
    expect(retailerInScope({ salesRepId: null }, "all", "me")).toBe(true);
    expect(retailerInScope({ salesRepId: "other" }, "all", "me")).toBe(true);
  });
});

describe("groupPickerRetailers", () => {
  const shops = [
    { name: "zeta", place: "Patna", phone: "9000000001", mine: true },
    { name: "Beta", place: "Gaya", phone: "9000000002", mine: false },
    { name: "alpha", place: "Patna", phone: "9000000003", mine: false },
    { name: "Gamma", place: "Ara", phone: "9000000004", mine: true },
  ];
  const names = (list: { name: string }[]) => list.map((s) => s.name);

  it("puts own shops first, each group A to Z whatever the capitals", () => {
    const { mine, other } = groupPickerRetailers(shops, "");
    expect(names(mine)).toEqual(["Gamma", "zeta"]);
    expect(names(other)).toEqual(["alpha", "Beta"]);
  });

  it("searches name, place and phone in any capitals, in both groups", () => {
    const patna = groupPickerRetailers(shops, "PATNA");
    expect(names(patna.mine)).toEqual(["zeta"]);
    expect(names(patna.other)).toEqual(["alpha"]);
    const phone = groupPickerRetailers(shops, "0000002");
    expect(names(phone.mine)).toEqual([]);
    expect(names(phone.other)).toEqual(["Beta"]);
  });

  it("is empty when nothing matches, and works without a phone", () => {
    expect(groupPickerRetailers(shops, "zzz")).toEqual({ mine: [], other: [] });
    expect(groupPickerRetailers([], "")).toEqual({ mine: [], other: [] });
    expect(names(groupPickerRetailers([{ name: "A", place: "" }], "a").other)).toEqual(["A"]);
  });

  it("does not change the list it was given", () => {
    const before = names(shops);
    groupPickerRetailers(shops, "");
    expect(names(shops)).toEqual(before);
  });
});
