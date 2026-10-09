import { describe, expect, it } from "vitest";
import { demoSeedBlocker, isLocalDatabaseUrl } from "./demo-seed-rules";

const local = "postgres://postgres:postgres@localhost:5435/app";

describe("demoSeedBlocker", () => {
  it("allows a local development database", () => {
    expect(demoSeedBlocker({ nodeEnv: "development", databaseUrl: local, force: false })).toBeNull();
  });
  it("refuses production", () => {
    expect(demoSeedBlocker({ nodeEnv: "production", databaseUrl: local, force: false })).toMatch(/production/);
  });
  it("refuses a remote database", () => {
    expect(
      demoSeedBlocker({ nodeEnv: "development", databaseUrl: "postgres://u:p@db.example.com:5432/app", force: false }),
    ).toMatch(/localhost/);
  });
  it("allows anything with the explicit flag", () => {
    expect(
      demoSeedBlocker({ nodeEnv: "production", databaseUrl: "postgres://u:p@db.example.com/app", force: true }),
    ).toBeNull();
  });
  it("treats a bad url as not local", () => {
    expect(isLocalDatabaseUrl("nonsense")).toBe(false);
    expect(isLocalDatabaseUrl("postgres://u:p@127.0.0.1/app")).toBe(true);
  });
});
