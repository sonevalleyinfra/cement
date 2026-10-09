import { describe, expect, it } from "vitest";
import { changedFields } from "./audit-rules";

describe("changedFields", () => {
  it("keeps only the fields that changed", () => {
    const res = changedFields({ name: "A", phone: "1", city: "X" }, { name: "B", phone: "1" });
    expect(res).toEqual({ before: { name: "A" }, after: { name: "B" } });
  });

  it("returns null when nothing changed", () => {
    expect(changedFields({ name: "A" }, { name: "A" })).toBeNull();
  });

  it("treats missing and null as the same", () => {
    expect(changedFields({ phone: null }, { phone: null })).toBeNull();
    expect(changedFields({}, { phone: null })).toBeNull();
  });

  it("compares lists by content", () => {
    expect(changedFields({ roles: ["a", "b"] }, { roles: ["a", "b"] })).toBeNull();
    expect(changedFields({ roles: ["a"] }, { roles: ["a", "b"] })).toEqual({
      before: { roles: ["a"] },
      after: { roles: ["a", "b"] },
    });
  });

  it("handles a new record (no before)", () => {
    expect(changedFields(undefined, { name: "A" })).toEqual({ before: { name: null }, after: { name: "A" } });
  });
});
