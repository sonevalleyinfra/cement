import { describe, expect, it } from "vitest";
import {
  canAccessFirm,
  hasAnyRole,
  isAdmin,
  isRole,
  joinRoles,
  parseRoles,
} from "./roles";

describe("isAdmin", () => {
  it("recognises the admin role, alone or among several", () => {
    expect(isAdmin("admin")).toBe(true);
    expect(isAdmin("user,admin")).toBe(true);
    expect(isAdmin("user, admin")).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isAdmin("user")).toBe(false);
    expect(isAdmin("superadmin")).toBe(false);
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
    expect(isAdmin("")).toBe(false);
  });
});

describe("parseRoles / joinRoles", () => {
  it("keeps known roles and drops unknown or blank ones", () => {
    expect(parseRoles("sales, accounts")).toEqual(["sales", "accounts"]);
    expect(parseRoles("user,sales,,boss")).toEqual(["sales"]);
    expect(parseRoles(null)).toEqual([]);
  });

  it("joins without duplicates", () => {
    expect(joinRoles(["sales", "accounts", "sales"])).toBe("sales,accounts");
    expect(joinRoles([])).toBe("");
  });

  it("knows what a role is", () => {
    expect(isRole("logistics")).toBe(true);
    expect(isRole("user")).toBe(false);
  });
});

describe("hasAnyRole", () => {
  it("passes when the user holds one of the allowed roles", () => {
    expect(hasAnyRole("sales", ["sales", "accounts"])).toBe(true);
    expect(hasAnyRole("logistics,accounts", ["accounts"])).toBe(true);
  });

  it("fails when the user holds none of them", () => {
    expect(hasAnyRole("retailer", ["sales", "accounts"])).toBe(false);
    expect(hasAnyRole("user", ["sales"])).toBe(false);
    expect(hasAnyRole(null, ["sales"])).toBe(false);
  });

  it("always passes for admin", () => {
    expect(hasAnyRole("admin", ["logistics"])).toBe(true);
    expect(hasAnyRole("sales,admin", ["logistics"])).toBe(true);
  });
});

describe("canAccessFirm", () => {
  it("lets a user into only the firms they were given", () => {
    expect(canAccessFirm("sales", ["a", "b"], "a")).toBe(true);
    expect(canAccessFirm("sales", ["a", "b"], "c")).toBe(false);
    expect(canAccessFirm("sales", [], "a")).toBe(false);
  });

  it("lets admin into every firm", () => {
    expect(canAccessFirm("admin", [], "c")).toBe(true);
  });
});
