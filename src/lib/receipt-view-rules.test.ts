import { describe, expect, it } from "vitest";
import {
  mayWorkOnAll,
  receiptFirmIds,
  showReversalDetails,
  visibleInterFirm,
  visibleReceiptLines,
} from "./receipt-view-rules";

describe("receiptFirmIds", () => {
  it("lists the split firms and the receiving firm once each", () => {
    expect(receiptFirmIds(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    expect(receiptFirmIds(["a", "b"], "a")).toEqual(["a", "b"]);
  });
  it("has no receiving firm for cash", () => {
    expect(receiptFirmIds(["a"], null)).toEqual(["a"]);
  });
});

describe("mayWorkOnAll", () => {
  it("needs every firm on the receipt", () => {
    expect(mayWorkOnAll(["a", "b"], ["a", "b", "c"])).toBe(true);
    expect(mayWorkOnAll(["a", "b"], ["a"])).toBe(false);
  });
  it("refuses when the user has only the receiving firm", () => {
    expect(mayWorkOnAll(receiptFirmIds(["b"], "a"), ["a"])).toBe(false);
  });
});

describe("visibleReceiptLines", () => {
  const lines = [
    { firmId: "a", amountPaise: 100 },
    { firmId: "b", amountPaise: 200 },
  ];
  it("shows staff only their own firms' lines", () => {
    expect(visibleReceiptLines(lines, { seeAll: false, firmIds: ["a"] })).toEqual([{ firmId: "a", amountPaise: 100 }]);
    expect(visibleReceiptLines(lines, { seeAll: false, firmIds: ["c"] })).toEqual([]);
  });
  it("shows admin and the shop's retailer every line", () => {
    expect(visibleReceiptLines(lines, { seeAll: true, firmIds: [] })).toEqual(lines);
  });
});

describe("visibleInterFirm", () => {
  const owes = [
    { owedByFirmId: "a", owedToFirmId: "b", amountPaise: 200 },
    { owedByFirmId: "a", owedToFirmId: "c", amountPaise: 300 },
  ];
  it("shows staff only lines for a firm they may see", () => {
    expect(visibleInterFirm(owes, { seeAll: false, firmIds: ["b"] })).toEqual([owes[0]]);
    // Only the receiving firm: the other firms' amounts stay hidden.
    expect(visibleInterFirm(owes, { seeAll: false, firmIds: ["a"] })).toEqual([]);
  });
  it("shows admin everything", () => {
    expect(visibleInterFirm(owes, { seeAll: true, firmIds: [] })).toEqual(owes);
  });
});

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
