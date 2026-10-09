import { describe, expect, it } from "vitest";
import { parseEnv } from "./env-schema";

const valid = {
  DATABASE_URL: "postgres://postgres:postgres@localhost:5433/app",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  EMAIL_FROM: "App <noreply@example.com>",
  EMAIL_MODE: "log",
  SEED_ADMIN_EMAIL: "owner@gmail.com",
  SEED_ADMIN_PASSWORD: "123456",
};

describe("parseEnv", () => {
  it("accepts a valid local setup", () => {
    const env = parseEnv(valid);
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.EMAIL_ALLOWLIST).toEqual([]);
  });

  it.each(["DATABASE_URL", "BETTER_AUTH_SECRET", "EMAIL_FROM", "EMAIL_MODE", "SEED_ADMIN_EMAIL", "SEED_ADMIN_PASSWORD"])(
    "refuses to start without %s",
    (name) => {
      expect(() => parseEnv({ ...valid, [name]: undefined })).toThrow(name);
    },
  );

  it("treats an empty value as missing", () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: "" })).toThrow("DATABASE_URL");
  });

  it("needs BETTER_AUTH_URL or COOLIFY_URL", () => {
    expect(() => parseEnv({ ...valid, BETTER_AUTH_URL: undefined })).toThrow("BETTER_AUTH_URL");
    expect(parseEnv({ ...valid, BETTER_AUTH_URL: undefined, COOLIFY_URL: "https://pr-3.example.com" }).APP_URL).toBe(
      "https://pr-3.example.com",
    );
  });

  it("rejects a short secret and a non-Postgres URL", () => {
    expect(() => parseEnv({ ...valid, BETTER_AUTH_SECRET: "short" })).toThrow("BETTER_AUTH_SECRET");
    expect(() => parseEnv({ ...valid, DATABASE_URL: "mysql://localhost/db" })).toThrow("DATABASE_URL");
  });

  it("needs RESEND_API_KEY unless EMAIL_MODE is log", () => {
    expect(() => parseEnv({ ...valid, EMAIL_MODE: "live" })).toThrow("RESEND_API_KEY");
    expect(parseEnv({ ...valid, EMAIL_MODE: "live", RESEND_API_KEY: "re_123" }).EMAIL_MODE).toBe("live");
  });

  it("needs a non-empty EMAIL_ALLOWLIST in allowlist mode", () => {
    const base = { ...valid, EMAIL_MODE: "allowlist", RESEND_API_KEY: "re_123" };
    expect(() => parseEnv(base)).toThrow("EMAIL_ALLOWLIST");
    expect(parseEnv({ ...base, EMAIL_ALLOWLIST: "A@x.com, b@y.com" }).EMAIL_ALLOWLIST).toEqual(["a@x.com", "b@y.com"]);
    expect(() => parseEnv({ ...base, EMAIL_ALLOWLIST: "not-an-email" })).toThrow("EMAIL_ALLOWLIST");
  });

  it("allows a short admin password locally but needs 12+ characters in production", () => {
    expect(() => parseEnv({ ...valid, SEED_ADMIN_PASSWORD: "12345" })).toThrow("SEED_ADMIN_PASSWORD");
    expect(() => parseEnv({ ...valid, NODE_ENV: "production" })).toThrow("SEED_ADMIN_PASSWORD");
    expect(parseEnv({ ...valid, NODE_ENV: "production", SEED_ADMIN_PASSWORD: "x".repeat(12) }).NODE_ENV).toBe(
      "production",
    );
  });

  it("rejects an unknown EMAIL_MODE", () => {
    expect(() => parseEnv({ ...valid, EMAIL_MODE: "send" })).toThrow("EMAIL_MODE");
  });
});
