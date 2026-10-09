import { describe, expect, it } from "vitest";
import { baseVersion, describeChanges, isExactPin, parseVersion, pickBigUpgrade, pickSafeUpdate } from "./dependency-updates";

const now = new Date("2026-10-08T12:00:00Z");
const old = "2026-09-01T00:00:00Z";
const yesterdayMorning = "2026-10-07T06:00:00Z"; // 30 hours ago
const anHourAgo = "2026-10-08T11:00:00Z";

describe("parseVersion / isExactPin / baseVersion", () => {
  it("only accepts plain release versions", () => {
    expect(parseVersion("16.3.8")).toEqual([16, 3, 8]);
    expect(parseVersion("16.4.0-canary.1")).toBeNull();
    expect(isExactPin("16.3.8")).toBe(true);
    expect(isExactPin("^16.3.8")).toBe(false);
  });

  it("reads where a range starts", () => {
    expect(baseVersion("^4")).toEqual([4, 0, 0]);
    expect(baseVersion("~1.2")).toEqual([1, 2, 0]);
    expect(baseVersion("0.45.3")).toEqual([0, 45, 3]);
    expect(baseVersion("latest")).toBeNull();
  });
});

describe("pickSafeUpdate", () => {
  const times = {
    created: old,
    modified: anHourAgo,
    "16.3.8": old,
    "16.3.9": old,
    "16.4.0": yesterdayMorning,
    "16.4.1": anHourAgo, // too new: pnpm would refuse it
    "16.5.0-canary.2": old, // pre-release: never
    "17.0.0": old, // breaking: never
  };

  it("picks the newest same-major version released at least a day ago", () => {
    expect(pickSafeUpdate("16.3.8", times, now)).toBe("16.4.0");
  });

  it("returns null when already up to date", () => {
    expect(pickSafeUpdate("16.4.0", times, now)).toBeNull();
  });

  it("keeps 0.x packages on the same minor, because their minors can break", () => {
    const zero = { "0.45.3": old, "0.45.4": old, "0.46.0": old };
    expect(pickSafeUpdate("0.45.3", zero, now)).toBe("0.45.4");
  });

  it("ignores specs that are not exact versions", () => {
    expect(pickSafeUpdate("^16.3.8", times, now)).toBeNull();
  });
});

describe("pickBigUpgrade", () => {
  it("reports the newest breaking version", () => {
    expect(pickBigUpgrade("16.3.8", { "17.0.0": old, "17.1.0": old, "18.0.0": anHourAgo }, now)).toBe("17.1.0");
    expect(pickBigUpgrade("^4", { "4.9.0": old, "5.0.0": old }, now)).toBe("5.0.0");
    expect(pickBigUpgrade("0.45.3", { "0.46.0": old }, now)).toBe("0.46.0");
  });

  it("returns null when there is none", () => {
    expect(pickBigUpgrade("16.3.8", { "16.9.0": old }, now)).toBeNull();
  });
});

describe("describeChanges", () => {
  it("lists packages whose version changed", () => {
    expect(describeChanges({ next: "16.3.8", zod: "4.6.5", react: "19.2.8" }, { next: "16.4.0", zod: "4.6.5", react: "19.2.9" })).toEqual([
      "next: 16.3.8 → 16.4.0",
      "react: 19.2.8 → 19.2.9",
    ]);
  });
});
