import { describe, expect, it } from "vitest";
import {
  checkAreaPick,
  cleanAreaName,
  cleanGeo,
  geoCapturedAt,
  geoErrorText,
  gstinCheckChar,
  isCalendarDate,
  isValidGstin,
  mapUrl,
  type ShopMasterForm,
  validateShopMaster,
} from "./shop-master-rules";

const ctx = { phone: "9876543210", today: "2026-10-24" };
const empty: ShopMasterForm = {
  ownerName: "",
  altPhone: "",
  address: "",
  areaId: "",
  pincode: "",
  lat: null,
  lng: null,
  category: "",
  openedOn: "",
  gstin: "",
};
const check = (over: Partial<ShopMasterForm>) => validateShopMaster({ ...empty, ...over }, ctx);
const value = (over: Partial<ShopMasterForm>) => {
  const r = check(over);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const error = (over: Partial<ShopMasterForm>) => {
  const r = check(over);
  return r.ok ? null : r.error;
};

describe("validateShopMaster: empty clears every field to null", () => {
  it("never stores empty text", () => {
    expect(value({})).toEqual({
      ownerName: null,
      altPhone: null,
      address: null,
      areaId: null,
      pincode: null,
      lat: null,
      lng: null,
      category: null,
      openedOn: null,
      gstin: null,
    });
    expect(value({ ownerName: "   ", address: "  ", pincode: " ", gstin: " ", altPhone: " " }).ownerName).toBeNull();
  });
  it("missing keys (an old client) are treated as empty", () => {
    expect(validateShopMaster({}, ctx).ok).toBe(true);
  });
});

describe("owner name", () => {
  it("trims and collapses spaces", () => expect(value({ ownerName: "  Ram   Prasad " }).ownerName).toBe("Ram Prasad"));
  it("allows 80 characters, not 81", () => {
    expect(value({ ownerName: "a".repeat(80) }).ownerName).toHaveLength(80);
    expect(error({ ownerName: "a".repeat(81) })).toBe("Owner name is too long");
  });
});

describe("alt phone", () => {
  it("normalises a valid mobile", () => expect(value({ altPhone: "+91 91234 56789" }).altPhone).toBe("9123456789"));
  it("refuses a non-mobile", () => {
    expect(error({ altPhone: "12345" })).toBe("Alt phone must be a 10-digit mobile");
    expect(error({ altPhone: "5123456789" })).toBe("Alt phone must be a 10-digit mobile");
  });
  it("must differ from the main phone", () => {
    expect(error({ altPhone: "098765 43210" })).toBe("Alt phone is the same as phone");
  });
});

describe("address", () => {
  it("is trimmed", () => expect(value({ address: "  Near Gandhi Maidan  " }).address).toBe("Near Gandhi Maidan"));
  it("allows 200 characters, not 201", () => {
    expect(value({ address: "a".repeat(200) }).address).toHaveLength(200);
    expect(error({ address: "a".repeat(201) })).toBe("Address is too long");
  });
});

describe("area", () => {
  it("keeps the picked id, empty = no area", () => {
    expect(value({ areaId: "a1" }).areaId).toBe("a1");
    expect(value({ areaId: "" }).areaId).toBeNull();
  });
});

describe("pincode", () => {
  it("accepts 6 digits not starting with 0 (spaces dropped)", () => {
    expect(value({ pincode: "800001" }).pincode).toBe("800001");
    expect(value({ pincode: "800 001" }).pincode).toBe("800001");
  });
  it("refuses everything else", () => {
    for (const p of ["080001", "80001", "8000011", "80000a"]) expect(error({ pincode: p })).toBe("Enter a 6-digit pincode");
  });
});

describe("GPS", () => {
  it("rounds to 6 decimals", () => {
    expect(value({ lat: 25.594095123, lng: 85.137565987 })).toMatchObject({ lat: 25.594095, lng: 85.137566 });
  });
  it("needs both or neither", () => {
    expect(error({ lat: 25.5, lng: null })).toBe("Pin the location again");
    expect(error({ lat: null, lng: 85.1 })).toBe("Pin the location again");
  });
  it("checks the ranges", () => {
    expect(cleanGeo({ lat: 90, lng: 180 }).ok).toBe(true);
    expect(cleanGeo({ lat: -90, lng: -180 }).ok).toBe(true);
    expect(cleanGeo({ lat: 90.1, lng: 0 }).ok).toBe(false);
    expect(cleanGeo({ lat: 0, lng: -180.5 }).ok).toBe(false);
    expect(cleanGeo({ lat: Number.NaN, lng: 0 }).ok).toBe(false);
    expect(cleanGeo({ lat: 0, lng: Number.POSITIVE_INFINITY }).ok).toBe(false);
  });
  it("neither is fine", () => expect(cleanGeo({})).toEqual({ ok: true, value: { lat: null, lng: null } }));
  it("map link", () => expect(mapUrl(25.5, 85.1)).toBe("https://www.google.com/maps?q=25.5,85.1"));
});

describe("geoCapturedAt", () => {
  const now = new Date("2026-10-24T10:00:00Z");
  it("is now when the pin changes to a value", () => {
    expect(geoCapturedAt({ lat: null, lng: null }, { lat: 25.5, lng: 85.1 }, now)).toBe(now);
    expect(geoCapturedAt({ lat: 25.4, lng: 85.1 }, { lat: 25.5, lng: 85.1 }, now)).toBe(now);
  });
  it("is null when cleared", () => {
    expect(geoCapturedAt({ lat: 25.5, lng: 85.1 }, { lat: null, lng: null }, now)).toBeNull();
  });
  it("keeps the old time when unchanged", () => {
    expect(geoCapturedAt({ lat: 25.5, lng: 85.1 }, { lat: 25.5, lng: 85.1 }, now)).toBeUndefined();
    expect(geoCapturedAt({ lat: null, lng: null }, { lat: null, lng: null }, now)).toBeUndefined();
  });
});

describe("geoErrorText", () => {
  it("has a short message per error", () => {
    expect(geoErrorText(1)).toBe("Location is blocked");
    expect(geoErrorText(2)).toBe("Location not found");
    expect(geoErrorText(3)).toBe("Location took too long");
    expect(geoErrorText(99)).toBe("Location not found");
  });
});

describe("category", () => {
  it("accepts retailer and contractor", () => {
    for (const c of ["retailer", "contractor"]) {
      expect(value({ category: c }).category).toBe(c);
    }
  });
  it("refuses anything else", () => expect(error({ category: "wholesaler" })).toBe("Pick a category"));
});

describe("opened on", () => {
  it("accepts a real past date and today", () => {
    expect(value({ openedOn: "2015-04-01" }).openedOn).toBe("2015-04-01");
    expect(value({ openedOn: "2026-10-24" }).openedOn).toBe("2026-10-24");
    expect(value({ openedOn: "1950-01-01" }).openedOn).toBe("1950-01-01");
  });
  it("refuses tomorrow, too old and impossible dates", () => {
    expect(error({ openedOn: "2026-10-25" })).toBe("Opening date can't be in the future");
    expect(error({ openedOn: "1949-12-31" })).toBe("Opening date is too old");
    expect(error({ openedOn: "2023-02-29" })).toBe("Enter a real opening date");
    expect(error({ openedOn: "24/10/2026" })).toBe("Enter a real opening date");
  });
  it("isCalendarDate knows leap years", () => {
    expect(isCalendarDate("2024-02-29")).toBe(true);
    expect(isCalendarDate("2023-02-29")).toBe(false);
    expect(isCalendarDate("2024-13-01")).toBe(false);
  });
});

describe("GSTIN", () => {
  it("accepts a known-valid GSTIN, lowercase too (stored in capitals)", () => {
    expect(isValidGstin("27AAPFU0939F1ZV")).toBe(true);
    expect(isValidGstin("27aapfu0939f1zv")).toBe(true);
    expect(value({ gstin: " 27aapfu0939f1zv " }).gstin).toBe("27AAPFU0939F1ZV");
  });
  it("refuses a wrong check character or a changed character", () => {
    expect(isValidGstin("27AAPFU0939F1ZW")).toBe(false);
    expect(isValidGstin("27AAPFU0938F1ZV")).toBe(false);
    expect(error({ gstin: "27AAPFU0939F1ZW" })).toBe("Check the GSTIN");
  });
  it("refuses the wrong shape", () => {
    expect(isValidGstin("27AAPFU0939F1Z")).toBe(false);
    expect(isValidGstin("27AAPFU0939F0ZV")).toBe(false);
    expect(isValidGstin("27AAPFU0939F1XV")).toBe(false);
  });
  it("computes the check character", () => expect(gstinCheckChar("27AAPFU0939F1Z")).toBe("V"));
});

describe("areas", () => {
  it("cleanAreaName trims, collapses and limits to 60", () => {
    expect(cleanAreaName("  Patna   City ")).toBe("Patna City");
    expect(cleanAreaName("   ")).toBeNull();
    expect(cleanAreaName("a".repeat(60))).toHaveLength(60);
    expect(cleanAreaName("a".repeat(61))).toBeNull();
  });
  it("a changed area must exist and be on", () => {
    expect(checkAreaPick("a2", "a1", { id: "a2", active: true })).toEqual({ ok: true });
    expect(checkAreaPick("a2", "a1", { id: "a2", active: false })).toEqual({ ok: false, error: "Pick an active area" });
    expect(checkAreaPick("a2", "a1", undefined)).toEqual({ ok: false, error: "Pick an active area" });
    expect(checkAreaPick("a2", null, { id: "a3", active: true }).ok).toBe(false);
  });
  it("an unchanged (even off) area is kept; no area is fine", () => {
    expect(checkAreaPick("a1", "a1", undefined)).toEqual({ ok: true });
    expect(checkAreaPick(null, "a1", undefined)).toEqual({ ok: true });
  });
});
