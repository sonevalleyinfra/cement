import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "./db-errors";

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
