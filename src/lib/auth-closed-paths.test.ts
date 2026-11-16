import { admin } from "better-auth/plugins";
import { describe, expect, it } from "vitest";
import { CLOSED_AUTH_PATHS, checkLoginChangeOnAdmin, isClosedAuthPath } from "./auth-closed-paths";

describe("closed sign-in library paths", () => {
  it("closes every admin endpoint the installed library has", () => {
    const paths = Object.values(admin().endpoints).map((e) => (e as { path: string }).path);
    expect(paths.length).toBeGreaterThan(10);
    for (const path of paths) expect(CLOSED_AUTH_PATHS, path).toContain(path);
  });

  it("closes acting as another user", () => {
    expect(isClosedAuthPath("/admin/impersonate-user")).toBe(true);
    expect(isClosedAuthPath("/admin/set-role")).toBe(true);
    expect(isClosedAuthPath("/admin/set-user-password")).toBe(true);
  });

  it("closes direct name, password and email changes", () => {
    for (const p of ["/update-user", "/change-password", "/change-email", "/delete-user"]) {
      expect(isClosedAuthPath(p)).toBe(true);
    }
  });

  it("leaves sign-in, sign-out and forgot password open", () => {
    for (const p of ["/sign-in/email", "/sign-out", "/get-session", "/request-password-reset", "/reset-password", "/verify-email"]) {
      expect(isClosedAuthPath(p)).toBe(false);
    }
  });
});

describe("checkLoginChangeOnAdmin", () => {
  const base = { isSelf: false, targetIsAdmin: true, emailChanges: false, passwordSet: false };

  it("lets an admin change their own email and password", () => {
    expect(checkLoginChangeOnAdmin({ ...base, isSelf: true, emailChanges: true, passwordSet: true })).toBeNull();
  });

  it("lets an admin set a staff member's email and password", () => {
    expect(checkLoginChangeOnAdmin({ ...base, targetIsAdmin: false, emailChanges: true, passwordSet: true })).toBeNull();
  });

  it("refuses a password for another admin", () => {
    expect(checkLoginChangeOnAdmin({ ...base, passwordSet: true })).toBe(
      "An admin's password cannot be set here. They use Forgot password.",
    );
  });

  it("refuses a new email for another admin", () => {
    expect(checkLoginChangeOnAdmin({ ...base, emailChanges: true })).toBe("An admin's email cannot be changed here.");
  });

  it("still lets another admin's phone or roles be saved", () => {
    expect(checkLoginChangeOnAdmin(base)).toBeNull();
  });
});
