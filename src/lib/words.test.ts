import { describe, expect, it } from "vitest";
import { bagsText, emptyListTitle, formatCount, isAre, roleLabel, roleLabels } from "./words";

describe("bagsText / isAre", () => {
  it("uses the singular for exactly one bag", () => {
    expect(bagsText(1)).toBe("1 bag");
    expect(bagsText(0)).toBe("0 bags");
    expect(bagsText(50)).toBe("50 bags");
    expect(isAre(1)).toBe("is");
    expect(isAre(2)).toBe("are");
  });
});

describe("roleLabel", () => {
  it("capitalises a role", () => {
    expect(roleLabel("sales")).toBe("Sales");
    expect(roleLabel("admin")).toBe("Admin");
  });
  it("labels every known role of a stored string and skips unknown ones", () => {
    expect(roleLabels("sales,accounts,user")).toEqual(["Sales", "Accounts"]);
    expect(roleLabels(null)).toEqual([]);
  });
});

describe("emptyListTitle", () => {
  it("blames the filter, not the app, when one is picked", () => {
    expect(emptyListTitle({ dates: false, other: false })).toBe("Nothing yet");
    expect(emptyListTitle({ dates: true, other: false })).toBe("Nothing in these dates");
    expect(emptyListTitle({ dates: false, other: true })).toBe("Nothing for these filters");
    expect(emptyListTitle({ dates: true, other: true })).toBe("Nothing for these filters");
  });
});

describe("formatCount", () => {
  it("groups the Indian way", () => {
    expect(formatCount(8350)).toBe("8,350");
    expect(formatCount(125000)).toBe("1,25,000");
    expect(formatCount(950)).toBe("950");
    expect(formatCount(-1200)).toBe("-1,200");
  });
});
