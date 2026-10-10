import { describe, expect, it } from "vitest";
import { showStaffDetails } from "./receipt-view-rules";

describe("showStaffDetails", () => {
  it("hides who recorded, checked or reversed it, and why, from a pure retailer", () => {
    expect(showStaffDetails("retailer")).toBe(false);
  });
  it("shows them to staff and admin", () => {
    expect(showStaffDetails("accounts")).toBe(true);
    expect(showStaffDetails("admin")).toBe(true);
    expect(showStaffDetails("retailer,sales")).toBe(true);
  });
});
