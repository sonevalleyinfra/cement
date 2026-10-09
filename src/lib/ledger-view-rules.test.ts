import { describe, expect, it } from "vitest";
import { ledgerEntryLabel, showLedgerNotes } from "./ledger-view-rules";

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

describe("ledgerEntryLabel", () => {
  it("calls a credit (negative) receipt row a payment", () => {
    expect(ledgerEntryLabel("receipt_credit", -50_000)).toBe("Payment");
  });
  it("calls a re-debit (positive) receipt row a reversed payment (bounce or reversal)", () => {
    expect(ledgerEntryLabel("receipt_credit", 50_000)).toBe("Payment reversed");
  });
  it("labels the other kinds by kind, whatever the sign", () => {
    expect(ledgerEntryLabel("opening", 10_000)).toBe("Opening balance");
    expect(ledgerEntryLabel("opening", -10_000)).toBe("Opening balance");
    expect(ledgerEntryLabel("order_debit", 10_000)).toBe("Order");
    expect(ledgerEntryLabel("adjustment", -10_000)).toBe("Adjustment");
  });
  it("falls back to the raw kind for an unknown kind", () => {
    expect(ledgerEntryLabel("something_new", 1)).toBe("something_new");
  });
});
