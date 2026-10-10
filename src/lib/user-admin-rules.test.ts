import { describe, expect, it } from "vitest";
import {
  checkCashHeld,
  dropsAllStaffRoles,
  checkDelete,
  checkRoles,
  checkSelfDeactivate,
  checkSelfRoleChange,
  cleanEmail,
  cleanUserPhone,
  passwordFromBytes,
  usersInTab,
  validateNewUser,
} from "./user-admin-rules";

describe("checkRoles", () => {
  it("needs a role", () => expect(checkRoles([])).toBe("Pick at least one role"));
  it("rejects unknown roles", () => expect(checkRoles(["boss"])).toBe("Unknown role"));
  it("keeps retailer apart from staff roles", () => {
    expect(checkRoles(["retailer", "sales"])).toMatch(/retailer/);
    expect(checkRoles(["retailer"])).toBeNull();
  });
  it("accepts staff roles alone or together", () => {
    expect(checkRoles(["sales"])).toBeNull();
    expect(checkRoles(["admin"])).toBeNull();
    expect(checkRoles(["sales", "accounts"])).toBeNull();
  });
});

describe("validateNewUser", () => {
  it("cleans the input", () => {
    const r = validateNewUser({
      name: "  Ram  Singh ",
      email: " Ram@X.com ",
      phone: "+91 98765 43210",
      roles: ["sales", "sales"],
    });
    expect(r).toEqual({
      ok: true,
      value: {
        name: "Ram Singh",
        email: "ram@x.com",
        phone: "9876543210",
        roles: ["sales"],
        password: null,
      },
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

describe("validateNewUser temporary password", () => {
  const base = { name: "A", email: "a@b.co", phone: "9876543210", roles: ["admin"] };
  it("keeps a valid password", () => {
    const r = validateNewUser({ ...base, password: "cement2026" });
    expect(r.ok && r.value.password).toBe("cement2026");
  });
  it("gives null for a blank box", () => {
    const r = validateNewUser({ ...base, password: "  " });
    expect(r.ok && r.value.password).toBeNull();
  });
  it("rejects a short password", () => {
    expect(validateNewUser({ ...base, password: "short" })).toEqual({
      ok: false,
      error: "Password: at least 8 characters",
    });
  });
});

describe("cleanEmail", () => {
  it("trims and lower-cases", () => expect(cleanEmail("  Ram@X.Com ")).toBe("ram@x.com"));
  it("rejects empty and bad emails", () => {
    expect(cleanEmail("")).toBeNull();
    expect(cleanEmail(undefined)).toBeNull();
    expect(cleanEmail("ram@x")).toBeNull();
    expect(cleanEmail("ram x@y.com")).toBeNull();
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

describe("checkDelete", () => {
  it("never deletes yourself", () => expect(checkDelete(true, false)).toBe("You cannot delete yourself"));
  it("needs the account deactivated first", () => expect(checkDelete(false, true)).toBe("Deactivate first"));
  it("allows a deactivated other user", () => expect(checkDelete(false, false)).toBeNull());
});

describe("usersInTab", () => {
  const rows = [
    { id: "1", role: "sales,accounts", active: true },
    { id: "2", role: "sales", active: false },
    { id: "3", role: "admin", active: true },
    { id: "4", role: "", active: true },
    { id: "5", role: "user", active: true },
  ];
  const ids = (r: { id: string }[]) => r.map((x) => x.id);
  it("splits by role and active state", () => {
    expect(ids(usersInTab(rows, "sales", true))).toEqual(["1"]);
    expect(ids(usersInTab(rows, "sales", false))).toEqual(["2"]);
    expect(ids(usersInTab(rows, "admin", true))).toEqual(["3"]);
  });
  it("shows a person with several roles under each", () => {
    expect(ids(usersInTab(rows, "accounts", true))).toEqual(["1"]);
  });
  it("puts people without a known role under none", () => {
    expect(ids(usersInTab(rows, "none", true))).toEqual(["4", "5"]);
  });
});

describe("cash held blocks leaving", () => {
  it("someone holding cash must hand it over first", () => {
    expect(checkCashHeld(1_250_050)).toBe("Ask them to hand over ₹12,500.50 first.");
    expect(checkCashHeld(500_000)).toBe("Ask them to hand over ₹5,000 first.");
  });
  it("nothing held: allowed", () => {
    expect(checkCashHeld(0)).toBeNull();
    expect(checkCashHeld(-100)).toBeNull();
  });
  it("only a change that leaves no staff role counts as leaving", () => {
    expect(dropsAllStaffRoles(["retailer"])).toBe(true);
    expect(dropsAllStaffRoles([])).toBe(true);
    expect(dropsAllStaffRoles(["sales"])).toBe(false);
    expect(dropsAllStaffRoles(["accounts", "logistics"])).toBe(false);
    expect(dropsAllStaffRoles(["admin"])).toBe(false);
  });
});
