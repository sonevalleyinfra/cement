import { describe, expect, it } from "vitest";
import { moreHides, navFor, thirdTab } from "./nav-rules";

describe("navFor", () => {
  it("gives each role its third tab", () => {
    expect(thirdTab("sales").href).toBe("/retailers");
    expect(thirdTab("admin").href).toBe("/retailers");
    expect(thirdTab("accounts")).toMatchObject({ href: "/receipts", label: "Payments", icon: "receipts" });
    expect(thirdTab("logistics")).toMatchObject({ href: "/stock", label: "Stock" });
    expect(thirdTab("retailer")).toMatchObject({ href: "/ledger", label: "Dues" });
    expect(thirdTab(null).href).toBe("/ledger");
  });
  it("first match wins for several roles", () => {
    expect(thirdTab("accounts,logistics").href).toBe("/receipts");
    expect(thirdTab("sales,accounts").href).toBe("/retailers");
  });
  it("keeps Home, Orders and More around it", () => {
    expect(navFor("logistics").map((n) => n.href)).toEqual(["/dashboard", "/orders", "/stock", "/more"]);
  });
});

describe("moreHides", () => {
  it("hides Ledger only for a shop login", () => {
    expect(moreHides("retailer", "/ledger")).toBe(true);
    expect(moreHides("accounts", "/ledger")).toBe(false);
    expect(moreHides("admin", "/ledger")).toBe(false);
    expect(moreHides("retailer", "/receipts")).toBe(false);
  });
  it("hides the row the third tab already shows", () => {
    expect(moreHides("accounts", "/receipts")).toBe(true);
    expect(moreHides("logistics", "/stock")).toBe(true);
    expect(moreHides("accounts,logistics", "/stock")).toBe(false);
    expect(moreHides("sales", "/stock")).toBe(false);
    expect(moreHides("admin", "/stock")).toBe(false);
  });
});
