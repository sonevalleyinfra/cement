import { describe, expect, it } from "vitest";
import { makeLocalEnv, moveLocalDatabasePort, parseDockerPorts, readEnvValue } from "./local-env";

const example = [
  "LOCAL_DB_PORT=5433",
  "DATABASE_URL=postgres://postgres:postgres@localhost:5433/app",
  "BETTER_AUTH_SECRET=change-me",
  "EMAIL_MODE=log",
  "",
].join("\n");

describe("makeLocalEnv", () => {
  it("sets the secret and uses the same port in LOCAL_DB_PORT and DATABASE_URL", () => {
    const env = makeLocalEnv(example, 5440, "s".repeat(48));
    expect(readEnvValue(env, "BETTER_AUTH_SECRET")).toBe("s".repeat(48));
    expect(readEnvValue(env, "LOCAL_DB_PORT")).toBe("5440");
    expect(readEnvValue(env, "DATABASE_URL")).toBe("postgres://postgres:postgres@localhost:5440/app");
    expect(readEnvValue(env, "EMAIL_MODE")).toBe("log");
  });
});

describe("readEnvValue", () => {
  it("reads values, strips quotes, and returns undefined when missing", () => {
    expect(readEnvValue('EMAIL_FROM="Shop <a@b.co>"\n', "EMAIL_FROM")).toBe("Shop <a@b.co>");
    expect(readEnvValue("A=1\n", "B")).toBeUndefined();
  });
});

describe("moveLocalDatabasePort", () => {
  it("changes both the port setting and the port inside DATABASE_URL, keeping the rest", () => {
    const env = moveLocalDatabasePort(example, 5441);
    expect(readEnvValue(env, "LOCAL_DB_PORT")).toBe("5441");
    expect(readEnvValue(env, "DATABASE_URL")).toBe("postgres://postgres:postgres@localhost:5441/app");
    expect(readEnvValue(env, "BETTER_AUTH_SECRET")).toBe("change-me");
  });
});

describe("parseDockerPorts", () => {
  it("reads host ports from docker ps, ignoring containers without published ports", () => {
    const output = "0.0.0.0:5433->5432/tcp, [::]:5433->5432/tcp\n\n127.0.0.1:8080->80/tcp\n5432/tcp\n";
    expect([...parseDockerPorts(output)].sort()).toEqual([5433, 8080]);
    expect(parseDockerPorts("").size).toBe(0);
  });
});
