import { describe, expect, it } from "vitest";
import { showStaffDetails } from "./receipt-view-rules";

describe("showStaffDetails", () => {
  it("hides who recorded, checked or reversed it, and why, from a pure retailer", () => {
    expect(showStaffDetails("retailer")).toBe(false);
  });
  it("shows them to staff and admin", () => {
    expect(showStaffDetails("accounts")).toBe(true);
    expect(showStaffDetails("admin")).toBe(true);
  });
  it("default deny: a login with no known role sees no staff details", () => {
    for (const role of [null, "", "user"]) expect(showStaffDetails(role)).toBe(false);
  });
});
