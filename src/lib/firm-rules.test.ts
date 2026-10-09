import { describe, expect, it } from "vitest";
import {
  checkRemoveFirm,
  isDuplicateFirmName,
  isValidGstin,
  normalizeGstin,
  pickFirmSlot,
  usersForNewFirm,
  validateFirm,
} from "./firm-rules";

describe("normalizeGstin", () => {
  it("uppercases and removes spaces", () => {
    expect(normalizeGstin(" 10 aabcu 9603r1zx ")).toBe("10AABCU9603R1ZX");
  });
});

describe("isValidGstin", () => {
  it("accepts a normal GSTIN", () => expect(isValidGstin("10AABCU9603R1ZX")).toBe(true));
  it("accepts a letter entity number", () => expect(isValidGstin("27AAPFU0939FAZV")).toBe(true));
  it("rejects too short", () => expect(isValidGstin("10AABCU9603R1Z")).toBe(false));
  it("rejects a missing Z", () => expect(isValidGstin("10AABCU9603R1AX")).toBe(false));
  it("rejects entity number 0", () => expect(isValidGstin("10AABCU9603R0ZX")).toBe(false));
  it("rejects lowercase (normalise first)", () => expect(isValidGstin("10aabcu9603r1zx")).toBe(false));
});

describe("validateFirm", () => {
  it("needs only a name", () => {
    expect(validateFirm({ name: "  Sone  Valley " })).toEqual({
      ok: true,
      value: { name: "Sone Valley", ownerName: "", phone: "", gstin: "", address: "" },
    });
  });

  it("cleans every field", () => {
    const res = validateFirm({
      name: "Firm A",
      ownerName: " Ravi  Kumar ",
      phone: "+91 98765 43210",
      gstin: "10aabcu9603r1zx",
      address: "  Main Road, Patna \n",
    });
    expect(res).toEqual({
      ok: true,
      value: {
        name: "Firm A",
        ownerName: "Ravi Kumar",
        phone: "9876543210",
        gstin: "10AABCU9603R1ZX",
        address: "Main Road, Patna",
      },
    });
  });

  it("rejects an empty name", () => {
    const res = validateFirm({ name: "   " });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.name).toBeDefined();
  });

  it("rejects a very long name", () => {
    const res = validateFirm({ name: "x".repeat(61) });
    expect(res.ok).toBe(false);
  });

  it("rejects a bad phone and a bad GSTIN", () => {
    const res = validateFirm({ name: "Firm A", phone: "12345", gstin: "ABC" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.phone).toBeDefined();
      expect(res.errors.gstin).toBeDefined();
    }
  });
});

describe("isDuplicateFirmName", () => {
  const list = [
    { id: "1", name: "Firm A" },
    { id: "2", name: "Firm B" },
  ];
  it("finds a clash ignoring case", () => expect(isDuplicateFirmName("firm a", list)).toBe(true));
  it("ignores the firm being edited", () => expect(isDuplicateFirmName("Firm A", list, "1")).toBe(false));
  it("allows a new name", () => expect(isDuplicateFirmName("Firm D", list)).toBe(false));
});

describe("pickFirmSlot", () => {
  it("takes the first free colour", () => expect(pickFirmSlot(["a", "b", "c"])).toBe("d"));
  it("fills a gap left by a removed firm", () => expect(pickFirmSlot(["a", "c"])).toBe("b"));
  it("starts at a when there are no firms", () => expect(pickFirmSlot([])).toBe("a"));
  it("reuses the least used colour when all are taken", () => {
    expect(pickFirmSlot(["a", "b", "c", "d", "e", "f", "a", "c"])).toBe("b");
  });
});

describe("checkRemoveFirm", () => {
  it("allows removing one of several", () => expect(checkRemoveFirm(["1", "2"], "1")).toBeNull());
  it("keeps the last firm", () => expect(checkRemoveFirm(["1"], "1")).toBe("Keep at least one firm"));
  it("refuses a firm that is not active", () => expect(checkRemoveFirm(["1", "2"], "3")).not.toBeNull());
});

describe("usersForNewFirm", () => {
  it("gives the new firm to everyone on any active firm, once each", () => {
    const links = [
      { userId: "sales1", firmId: "A" },
      { userId: "sales1", firmId: "B" },
      { userId: "acct1", firmId: "B" },
      { userId: "shop1", firmId: "C" },
    ];
    expect(usersForNewFirm(links, ["A", "B", "C"])).toEqual(["sales1", "acct1", "shop1"]);
  });

  it("skips people whose only firm was removed", () => {
    const links = [
      { userId: "old", firmId: "X" },
      { userId: "new", firmId: "A" },
    ];
    expect(usersForNewFirm(links, ["A"])).toEqual(["new"]);
  });

  it("is empty when nobody has firm access", () => expect(usersForNewFirm([], ["A"])).toEqual([]));
});
