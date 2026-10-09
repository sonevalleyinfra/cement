import { describe, expect, it } from "vitest";
import { showLedgerNotes } from "./ledger-view-rules";

describe("showLedgerNotes", () => {
  it("hides staff notes from a pure retailer", () => {
    expect(showLedgerNotes("retailer")).toBe(false);
  });
  it("shows them to staff and admin", () => {
    expect(showLedgerNotes("admin")).toBe(true);
    expect(showLedgerNotes("accounts")).toBe(true);
    expect(showLedgerNotes("sales")).toBe(true);
    expect(showLedgerNotes("logistics")).toBe(true);
  });
  it("shows them when the retailer role is mixed with a staff role", () => {
    expect(showLedgerNotes("retailer,sales")).toBe(true);
  });
});
