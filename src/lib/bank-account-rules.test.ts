import { describe, expect, it } from "vitest";
import { bankAccountLabel, checkBankAccount } from "./bank-account-rules";

describe("checkBankAccount", () => {
  it("keeps a clean name and turns empty last 4 / UPI into null", () => {
    expect(checkBankAccount({ name: "  SBI   Current ", last4: " ", upiId: "" })).toEqual({
      ok: true,
      value: { name: "SBI Current", last4: null, upiId: null },
    });
  });
  it("keeps last 4 digits and a UPI ID", () => {
    expect(checkBankAccount({ name: "HDFC", last4: "4521", upiId: " sonevalley@hdfcbank " })).toEqual({
      ok: true,
      value: { name: "HDFC", last4: "4521", upiId: "sonevalley@hdfcbank" },
    });
  });
  it("needs a name of 60 characters at most", () => {
    expect(checkBankAccount({ name: "  " })).toEqual({ ok: false, error: "Enter the account name." });
    expect(checkBankAccount({ name: 5 })).toEqual({ ok: false, error: "Enter the account name." });
    expect(checkBankAccount({ name: "a".repeat(60) }).ok).toBe(true);
    expect(checkBankAccount({ name: "a".repeat(61) }).ok).toBe(false);
  });
  it("last 4 must be exactly 4 digits", () => {
    for (const last4 of ["452", "45211", "45a1", "45 1"]) {
      expect(checkBankAccount({ name: "SBI", last4 })).toEqual({ ok: false, error: "Last 4 digits must be 4 digits." });
    }
  });
  it("a UPI ID looks like name@bank", () => {
    for (const upiId of ["sonevalley", "@hdfc", "sone valley@hdfc", "a@b c", `${"a".repeat(55)}@hdfcbank`]) {
      expect(checkBankAccount({ name: "HDFC", upiId })).toEqual({ ok: false, error: "That UPI ID doesn't look right." });
    }
    expect(checkBankAccount({ name: "HDFC", upiId: "shop.name-1_x@ok.axis" }).ok).toBe(true);
  });
});

describe("bankAccountLabel", () => {
  it("adds the last 4 digits when set", () => {
    expect(bankAccountLabel({ name: "SBI Current", last4: "4521" })).toBe("SBI Current ··4521");
    expect(bankAccountLabel({ name: "HDFC UPI", last4: null })).toBe("HDFC UPI");
  });
});
