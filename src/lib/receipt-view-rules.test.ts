import { describe, expect, it } from "vitest";
import { showReversalDetails } from "./receipt-view-rules";

describe("showReversalDetails", () => {
  it("hides the reason and who reversed from a pure retailer", () => {
    expect(showReversalDetails("retailer")).toBe(false);
  });
  it("shows them to staff and admin", () => {
    expect(showReversalDetails("accounts")).toBe(true);
    expect(showReversalDetails("admin")).toBe(true);
    expect(showReversalDetails("retailer,sales")).toBe(true);
  });
});
