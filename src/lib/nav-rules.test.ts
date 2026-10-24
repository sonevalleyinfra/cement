import { describe, expect, it } from "vitest";
import { moreGroups, moreHides, navFor, thirdTab } from "./nav-rules";

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

describe("moreGroups", () => {
  const titles = (role: string) => moreGroups(role).map((g) => g.title);
  const hrefs = (role: string) => moreGroups(role).flatMap((g) => g.rows.map((r) => r.href));

  it("gives admin every group, with Books check under Records", () => {
    expect(titles("admin")).toEqual(["Money", "Goods", "People", "Records", "Account"]);
    const records = moreGroups("admin").find((g) => g.title === "Records");
    expect(records?.rows.map((r) => r.href)).toEqual(["/reports", "/activity", "/reports/books"]);
  });
  it("lists Areas under People for admin only", () => {
    const people = moreGroups("admin").find((g) => g.title === "People");
    expect(people?.rows).toContainEqual({ href: "/areas", label: "Areas", permission: "editRetailers" });
    for (const role of ["sales", "accounts", "logistics", "retailer"]) expect(hrefs(role)).not.toContain("/areas");
  });
  it("lists Bank accounts under Money for admin only", () => {
    const money = moreGroups("admin").find((g) => g.title === "Money");
    expect(money?.rows).toContainEqual({ href: "/bank-accounts", label: "Bank accounts", permission: "manageBankAccounts" });
    for (const role of ["sales", "accounts", "logistics", "retailer"]) expect(hrefs(role)).not.toContain("/bank-accounts");
  });
  it("shows Books check only to admin", () => {
    expect(hrefs("accounts")).not.toContain("/reports/books");
    expect(hrefs("sales")).not.toContain("/reports/books");
  });
  it("drops empty groups and the role's third tab", () => {
    expect(titles("retailer")).toEqual(["Account"]);
    expect(hrefs("retailer")).not.toContain("/ledger");

    expect(titles("accounts")).toEqual(["Money", "Goods", "Account"]);
    expect(hrefs("accounts")).not.toContain("/receipts");

    expect(titles("logistics")).toEqual(["Money", "Goods", "Account"]);
    expect(hrefs("logistics")).not.toContain("/stock");
    expect(hrefs("logistics")).toContain("/dispatch");
  });
  it("never returns a group without rows", () => {
    for (const role of ["admin", "sales", "accounts", "logistics", "retailer", "accounts,logistics"]) {
      expect(moreGroups(role).every((g) => g.rows.length > 0)).toBe(true);
    }
  });
});
