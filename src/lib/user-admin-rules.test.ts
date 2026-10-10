import { describe, expect, it } from "vitest";
import {
  checkRolesAndFirms,
  checkSelfDeactivate,
  checkSelfRoleChange,
  cleanUserPhone,
  passwordFromBytes,
  validateNewUser,
} from "./user-admin-rules";

describe("checkRolesAndFirms", () => {
  it("needs a role", () => expect(checkRolesAndFirms([], ["f"])).toBe("Pick at least one role"));
  it("rejects unknown roles", () => expect(checkRolesAndFirms(["boss"], ["f"])).toBe("Unknown role"));
  it("keeps retailer apart from staff roles", () => {
    expect(checkRolesAndFirms(["retailer", "sales"], ["f"])).toMatch(/retailer/);
    expect(checkRolesAndFirms(["retailer"], ["f"])).toBeNull();
  });
  it("needs a firm unless admin", () => {
    expect(checkRolesAndFirms(["sales"], [])).toBe("Pick at least one firm");
    expect(checkRolesAndFirms(["admin"], [])).toBeNull();
    expect(checkRolesAndFirms(["sales", "accounts"], ["f"])).toBeNull();
  });
});

describe("validateNewUser", () => {
  it("cleans the input", () => {
    const r = validateNewUser({
      name: "  Ram  Singh ",
      email: " Ram@X.com ",
      phone: "+91 98765 43210",
      roles: ["sales", "sales"],
      firmIds: ["a"],
    });
    expect(r).toEqual({
      ok: true,
      value: { name: "Ram Singh", email: "ram@x.com", phone: "9876543210", roles: ["sales"], firmIds: ["a"] },
    });
  });
  it("rejects bad name and email", () => {
    expect(validateNewUser({ name: "", email: "a@b.co", phone: "9876543210", roles: ["admin"] }).ok).toBe(false);
    expect(validateNewUser({ name: "A", email: "nope", phone: "9876543210", roles: ["admin"] }).ok).toBe(false);
  });
  it("needs a valid 10-digit mobile", () => {
    const missing = validateNewUser({ name: "A", email: "a@b.co", roles: ["admin"] });
    expect(missing).toEqual({ ok: false, error: "Enter a 10-digit mobile" });
    expect(validateNewUser({ name: "A", email: "a@b.co", phone: "12345", roles: ["admin"] }).ok).toBe(false);
    expect(validateNewUser({ name: "A", email: "a@b.co", phone: "5876543210", roles: ["admin"] }).ok).toBe(false);
    expect(validateNewUser({ name: "A", email: "a@b.co", phone: "09876543210", roles: ["admin"] }).ok).toBe(true);
  });
});

describe("cleanUserPhone", () => {
  it("keeps 10 digits of a valid mobile", () => {
    expect(cleanUserPhone("+91 98765 43210")).toBe("9876543210");
    expect(cleanUserPhone(" 9876543210 ")).toBe("9876543210");
  });
  it("rejects empty and bad numbers", () => {
    expect(cleanUserPhone("")).toBeNull();
    expect(cleanUserPhone(undefined)).toBeNull();
    expect(cleanUserPhone("12345")).toBeNull();
    expect(cleanUserPhone("5876543210")).toBeNull();
  });
});

describe("self-lockout guards", () => {
  it("blocks removing own admin role", () => {
    expect(checkSelfRoleChange(true, ["sales"])).not.toBeNull();
    expect(checkSelfRoleChange(true, ["admin", "sales"])).toBeNull();
    expect(checkSelfRoleChange(false, ["sales"])).toBeNull();
  });
  it("blocks deactivating yourself", () => {
    expect(checkSelfDeactivate(true, false)).not.toBeNull();
    expect(checkSelfDeactivate(true, true)).toBeNull();
    expect(checkSelfDeactivate(false, false)).toBeNull();
  });
});

describe("passwordFromBytes", () => {
  it("makes 12 safe characters", () => {
    const p = passwordFromBytes(Uint8Array.from({ length: 16 }, (_, i) => i * 17));
    expect(p).toHaveLength(12);
    expect(p).toMatch(/^[a-zA-Z0-9]+$/);
  });
});
