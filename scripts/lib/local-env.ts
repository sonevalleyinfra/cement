/**
 * Plain rules for the local .env file, used by `pnpm new-app` and `pnpm dev`.
 * No files, no network: easy to test.
 */
import { setEnvValue } from "./launch-plan";

/** A .env for this computer, made from .env.example: a fresh secret and its own database port. */
export function makeLocalEnv(example: string, dbPort: number, secret: string): string {
  let env = setEnvValue(example, "BETTER_AUTH_SECRET", secret);
  env = setEnvValue(env, "LOCAL_DB_PORT", String(dbPort));
  return setEnvValue(env, "DATABASE_URL", `postgres://postgres:postgres@localhost:${dbPort}/app`);
}

/** The value of KEY in the text of a .env file, without quotes. Undefined when missing. */
export function readEnvValue(content: string, key: string): string | undefined {
  const match = content.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match?.[1].trim().replace(/^(["'])(.*)\1$/, "$2");
}

/** Moves the local database to another port: updates LOCAL_DB_PORT and the port inside DATABASE_URL. */
export function moveLocalDatabasePort(content: string, port: number): string {
  let env = setEnvValue(content, "LOCAL_DB_PORT", String(port));
  const databaseUrl = readEnvValue(env, "DATABASE_URL");
  if (databaseUrl) {
    const url = new URL(databaseUrl);
    url.port = String(port);
    env = setEnvValue(env, "DATABASE_URL", url.toString());
  }
  return env;
}

/**
 * Host ports published by running Docker containers, from `docker ps --format "{{.Ports}}"`,
 * e.g. "0.0.0.0:5433->5432/tcp, [::]:5433->5432/tcp". Docker can hold a port without the
 * computer reporting it as busy, so this is checked as well.
 */
export function parseDockerPorts(psOutput: string): Set<number> {
  return new Set([...psOutput.matchAll(/:(\d+)->/g)].map((match) => Number(match[1])));
}
