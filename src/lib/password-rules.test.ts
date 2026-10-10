import { describe, expect, it } from "vitest";
import { checkNewPassword, checkTempPassword } from "./password-rules";

describe("checkNewPassword", () => {
  it("accepts a new password of 8+ characters that is repeated correctly", () => {
    expect(checkNewPassword({ current: "123456", next: "a-better-one", confirm: "a-better-one" })).toBeNull();
  });

  it("rejects a new password shorter than 8 characters", () => {
    expect(checkNewPassword({ current: "123456", next: "1234567", confirm: "1234567" })).toMatch("at least 8");
  });

  it("rejects when the two new passwords differ", () => {
    expect(checkNewPassword({ current: "123456", next: "a-better-one", confirm: "a-better-two" })).toMatch(
      "do not match",
    );
  });

  it("rejects keeping the same password", () => {
    expect(checkNewPassword({ current: "same-password", next: "same-password", confirm: "same-password" })).toMatch(
      "different",
    );
  });
});

describe("checkTempPassword", () => {
  it("treats a blank box as not set", () => {
    expect(checkTempPassword("")).toEqual({ ok: true, value: null });
    expect(checkTempPassword("   ")).toEqual({ ok: true, value: null });
    expect(checkTempPassword(undefined)).toEqual({ ok: true, value: null });
  });

  it("accepts 8+ characters as typed", () => {
    expect(checkTempPassword("Cement 2026")).toEqual({ ok: true, value: "Cement 2026" });
  });

  it("rejects fewer than 8 characters", () => {
    expect(checkTempPassword("1234567")).toEqual({ ok: false, error: "Password: at least 8 characters" });
  });

  it("rejects spaces at the ends instead of quietly trimming them", () => {
    expect(checkTempPassword(" cement2026").ok).toBe(false);
    expect(checkTempPassword("cement2026 ").ok).toBe(false);
  });

  it("rejects more than 128 characters", () => {
    expect(checkTempPassword("a".repeat(128)).ok).toBe(true);
    expect(checkTempPassword("a".repeat(129))).toEqual({ ok: false, error: "Password: at most 128 characters" });
  });
});
