import { describe, expect, it } from "vitest";
import { ALL_FIRMS, isValidFirmChoice, resolveFirmSelection, writeBlockMessage } from "./firm-selection";

const ids = ["f1", "f2"];

describe("resolveFirmSelection", () => {
  it("uses the cookie firm when allowed", () => {
    expect(resolveFirmSelection("f2", ids, false)).toEqual({ mode: "firm", firmId: "f2", readOnly: false });
  });
  it("falls back to the first firm when the cookie is missing or not allowed", () => {
    expect(resolveFirmSelection(undefined, ids, false).firmId).toBe("f1");
    expect(resolveFirmSelection("other", ids, false).firmId).toBe("f1");
  });
  it("lets admin pick All firms, read-only", () => {
    expect(resolveFirmSelection(ALL_FIRMS, ids, true)).toEqual({ mode: "all", firmId: null, readOnly: true });
  });
  it("ignores All firms for non-admin", () => {
    expect(resolveFirmSelection(ALL_FIRMS, ids, false).mode).toBe("firm");
  });
  it("has no firm when the user has none", () => {
    expect(resolveFirmSelection("f1", [], false)).toEqual({ mode: "none", firmId: null, readOnly: true });
  });
});

describe("isValidFirmChoice", () => {
  it("accepts allowed firms and All firms for admin only", () => {
    expect(isValidFirmChoice("f1", ids, false)).toBe(true);
    expect(isValidFirmChoice("x", ids, false)).toBe(false);
    expect(isValidFirmChoice(ALL_FIRMS, ids, true)).toBe(true);
    expect(isValidFirmChoice(ALL_FIRMS, ids, false)).toBe(false);
  });
});

describe("writeBlockMessage", () => {
  it("allows writes with one firm picked", () => {
    expect(writeBlockMessage(resolveFirmSelection("f1", ids, false))).toBeNull();
    expect(writeBlockMessage(resolveFirmSelection("f2", ids, true))).toBeNull();
  });
  it("blocks writes in the admin's All firms view", () => {
    expect(writeBlockMessage(resolveFirmSelection(ALL_FIRMS, ids, true))).toMatch(/view only/);
  });
  it("blocks writes when the user has no firm", () => {
    expect(writeBlockMessage(resolveFirmSelection(undefined, [], false))).not.toBeNull();
  });
});
