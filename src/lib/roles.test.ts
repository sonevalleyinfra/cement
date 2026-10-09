import { describe, expect, it } from "vitest";
import { isAdmin } from "./roles";

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
