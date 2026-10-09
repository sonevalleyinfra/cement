import { describe, expect, it } from "vitest";
import { placeholderAdminToReplace } from "./admin-seed";

const placeholder = { id: "1", email: "admin@example.com" };
const real = { id: "2", email: "owner@gmail.com" };

describe("placeholderAdminToReplace", () => {
  it("replaces the placeholder admin when SEED_ADMIN_EMAIL is a real address", () => {
    expect(placeholderAdminToReplace([placeholder], "owner@gmail.com")).toBe(placeholder);
  });

  it("keeps the placeholder if SEED_ADMIN_EMAIL is still the placeholder", () => {
    expect(placeholderAdminToReplace([placeholder], "Admin@Example.com")).toBeNull();
  });

  it("never picks a real admin", () => {
    expect(placeholderAdminToReplace([real], "someone@gmail.com")).toBeNull();
    expect(placeholderAdminToReplace([real, placeholder], "someone@gmail.com")).toBe(placeholder);
  });
});
