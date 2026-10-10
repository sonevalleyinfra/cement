import { describe, expect, it } from "vitest";
import { accountCreatedMessage } from "./templates";

describe("accountCreatedMessage", () => {
  it("mentions the password link when the admin did not set a password", () => {
    const m = accountCreatedMessage("a@b.co", "Ram", "https://x.test/sign-in");
    expect(m.text).toContain("link to choose your password");
    expect(m.html).toContain("once that is done");
  });

  it("points to Change password when the admin set a temporary password", () => {
    const m = accountCreatedMessage("a@b.co", "Ram", "https://x.test/sign-in", true);
    expect(m.text).toContain("temporary password");
    expect(m.text).toContain("Change password");
    expect(m.text).not.toContain("link to choose");
    expect(m.html).toContain("https://x.test/sign-in");
  });
});
