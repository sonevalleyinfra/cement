import { describe, expect, it } from "vitest";
import { checkNewPassword } from "./password-rules";

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
