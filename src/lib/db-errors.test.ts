import { describe, expect, it } from "vitest";
import { isCheckViolation, isForeignKeyViolation, isUniqueViolation } from "./db-errors";

describe("isUniqueViolation", () => {
  const pg = { code: "23505", constraint_name: "receipts_utr_unique_idx" };
  it("finds the unique failure on the error or on its cause", () => {
    expect(isUniqueViolation(pg)).toBe(true);
    expect(isUniqueViolation(new Error("Failed query", { cause: pg }), "receipts_utr_unique_idx")).toBe(true);
  });
  it("checks the index name when given", () => {
    expect(isUniqueViolation(pg, "other_idx")).toBe(false);
  });
  it("ignores other errors", () => {
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});

describe("isCheckViolation", () => {
  const pg = { code: "23514", constraint_name: "receipts_received_on_not_future" };
  it("finds a CHECK failure of one of the named rules, on the error or its cause", () => {
    expect(isCheckViolation(pg)).toBe(true);
    expect(
      isCheckViolation(new Error("Failed query", { cause: pg }), "receipts_backdate_reason_required", "receipts_received_on_not_future"),
    ).toBe(true);
    expect(isCheckViolation(pg, "receipts_backdate_reason_required")).toBe(false);
  });
  it("ignores other errors", () => {
    expect(isCheckViolation({ code: "23505", constraint_name: "receipts_received_on_not_future" })).toBe(false);
    expect(isCheckViolation(undefined)).toBe(false);
  });
});

describe("isForeignKeyViolation", () => {
  it("finds a foreign-key failure, by name when given", () => {
    const pg = { code: "23503", constraint_name: "receipts_bank_account_id_bank_accounts_id_fk" };
    expect(isForeignKeyViolation(new Error("x", { cause: pg }))).toBe(true);
    expect(isForeignKeyViolation(pg, "receipts_bank_account_id_bank_accounts_id_fk")).toBe(true);
    expect(isForeignKeyViolation(pg, "other_fk")).toBe(false);
    expect(isForeignKeyViolation({ code: "23514" })).toBe(false);
  });
});
