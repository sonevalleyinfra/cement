import { parseEnv, type Env } from "@/lib/env-schema";

/**
 * Every environment variable the app reads is declared and checked here
 * (rules in src/lib/env-schema.ts). Never read process.env anywhere else:
 * import { env } from "@/env".
 *
 * If something is missing or wrong, the app refuses to start and prints
 * exactly which variable is the problem.
 */

// `next build` imports server code but has no runtime secrets (they are only
// given to the container when it starts). While building we use obviously
// fake values that never connect anywhere; the real check runs when the
// server or a script starts (NEXT_PHASE is only set during `next build`).
const isNextBuild = process.env.NEXT_PHASE === "phase-production-build";

const buildTimePlaceholders = {
  DATABASE_URL: "postgres://build:build@build-placeholder:5432/build",
  BETTER_AUTH_SECRET: "build-time-placeholder-secret-never-used-at-runtime",
  BETTER_AUTH_URL: "http://build-placeholder.invalid",
  EMAIL_FROM: "build@build-placeholder.invalid",
  EMAIL_MODE: "log",
  SEED_ADMIN_EMAIL: "build@example.com",
  SEED_ADMIN_PASSWORD: "build-placeholder",
};

export const env: Env = parseEnv(isNextBuild ? buildTimePlaceholders : process.env);
