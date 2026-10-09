import { describe, expect, it } from "vitest";
import { parseUrlList, resolveBaseUrl, resolveTrustedOrigins } from "./base-url";

describe("resolveBaseUrl", () => {
  it("prefers BETTER_AUTH_URL", () => {
    expect(resolveBaseUrl("https://app.example.com/", "https://other.example.com")).toBe(
      "https://app.example.com",
    );
  });

  it("falls back to COOLIFY_URL (e.g. preview deployments)", () => {
    expect(resolveBaseUrl(undefined, "https://pr-12.app.example.com")).toBe("https://pr-12.app.example.com");
  });

  it("uses the first COOLIFY_URL when there are several domains", () => {
    expect(resolveBaseUrl(undefined, "https://a.example.com,https://b.example.com")).toBe(
      "https://a.example.com",
    );
  });

  it("adds https:// when Coolify gives a bare host name", () => {
    expect(resolveBaseUrl(undefined, "app.example.com")).toBe("https://app.example.com");
  });

  it("returns undefined when neither is set", () => {
    expect(resolveBaseUrl(undefined, undefined)).toBeUndefined();
    expect(resolveBaseUrl(undefined, " , ")).toBeUndefined();
  });
});

describe("resolveTrustedOrigins", () => {
  it("includes every domain without duplicates", () => {
    expect(
      resolveTrustedOrigins("https://a.example.com", "https://a.example.com, https://b.example.com"),
    ).toEqual(["https://a.example.com", "https://b.example.com"]);
  });
});

describe("parseUrlList", () => {
  it("keeps http:// when given explicitly", () => {
    expect(parseUrlList("http://localhost:3000")).toEqual(["http://localhost:3000"]);
  });
});
