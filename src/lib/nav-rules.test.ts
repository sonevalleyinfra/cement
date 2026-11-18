import { describe, expect, it } from "vitest";
import { backFor, homeScreens, moreGroups, navFor } from "./nav-rules";

describe("navFor", () => {
  it("is Home and More only, for everyone", () => {
    expect(navFor().map((n) => n.href)).toEqual(["/dashboard", "/more"]);
  });
});

describe("homeScreens", () => {
  it("lists what each role opens straight from Home", () => {
    expect(homeScreens("sales")).toEqual(["/orders", "/ledger"]);
    expect(homeScreens("accounts")).toEqual(["/orders", "/receipts", "/trucks"]);
    expect(homeScreens("logistics")).toEqual(["/orders", "/stock", "/trucks"]);
    expect(homeScreens("retailer")).toEqual(["/orders", "/ledger"]);
    expect(homeScreens("admin")).toEqual(["/orders", "/retailers", "/trucks"]);
    expect(homeScreens(null)).toEqual(["/orders"]);
  });
  it("joins the lists of a person with several roles", () => {
    expect(homeScreens("accounts,logistics")).toEqual(["/orders", "/receipts", "/trucks", "/stock"]);
  });
});

describe("backFor", () => {
  it("goes Home from a screen the role opens from Home", () => {
    expect(backFor("sales", "/orders")).toBe("/dashboard");
    expect(backFor("sales", "/ledger")).toBe("/dashboard");
    expect(backFor("accounts", "/receipts")).toBe("/dashboard");
    expect(backFor("logistics", "/stock")).toBe("/dashboard");
    expect(backFor("retailer", "/ledger")).toBe("/dashboard");
  });
  it("goes to More from every other screen", () => {
    expect(backFor("sales", "/retailers")).toBe("/more");
    expect(backFor("admin", "/stock")).toBe("/more");
    expect(backFor("sales", "/receipts")).toBe("/more");
    expect(backFor("logistics", "/dispatch")).toBe("/more");
  });
});

describe("moreGroups", () => {
  const titles = (role: string) => moreGroups(role).map((g) => g.title);
  const hrefs = (role: string) => moreGroups(role).flatMap((g) => g.rows.map((r) => r.href));

  it("gives admin every group under Records", () => {
    expect(titles("admin")).toEqual(["Orders and shops", "Money", "Goods", "People", "Records", "Account"]);
    const records = moreGroups("admin").find((g) => g.title === "Records");
    expect(records?.rows.map((r) => r.href)).toEqual(["/reports", "/activity"]);
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
  it("does not list Books check", () => {
    expect(hrefs("admin")).not.toContain("/reports/books");
    expect(hrefs("accounts")).not.toContain("/reports/books");
    expect(hrefs("sales")).not.toContain("/reports/books");
  });
  it("drops empty groups and lists every screen the role may open", () => {
    expect(titles("retailer")).toEqual(["Orders and shops", "Money", "Account"]);
    expect(hrefs("retailer")).toEqual(["/orders", "/ledger", "/account"]);

    expect(titles("accounts")).toEqual(["Orders and shops", "Money", "Goods", "Records", "Account"]);
    expect(hrefs("accounts")).toContain("/receipts");
    expect(hrefs("accounts")).toContain("/trucks");
    expect(hrefs("accounts")).toContain("/reports");
    expect(hrefs("accounts")).not.toContain("/activity");

    expect(titles("logistics")).toEqual(["Orders and shops", "Money", "Goods", "Account"]);
    expect(hrefs("logistics")).toContain("/stock");
    expect(hrefs("logistics")).toContain("/dispatch");
    expect(hrefs("sales")).not.toContain("/trucks");
  });
  it("never returns a group without rows", () => {
    for (const role of ["admin", "sales", "accounts", "logistics", "retailer", "accounts,logistics"]) {
      expect(moreGroups(role).every((g) => g.rows.length > 0)).toBe(true);
    }
  });
});
