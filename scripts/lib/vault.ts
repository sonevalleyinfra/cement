/**
 * Plain rules for your key safe (~/.config/app-factory/): which keys an app needs,
 * which test or live key goes where, and the safety checks around them.
 * No files, no network: easy to test. Reading and writing the safe is in vault-store.ts.
 *
 * An app says which keys it needs by listing them in .env.example, e.g.  RAZORPAY_KEY_ID=
 *   - empty value             → required in production (release and launch refuse without it)
 *   - "(optional)" in the comment right above it, or a default value → not required
 */
import { parse } from "dotenv";
import { setEnvValue } from "./launch-plan";

/** Keys the kit sets itself (database, auth, email, admin). The key safe never touches these. */
export const KIT_MANAGED_KEYS = new Set([
  "NODE_ENV",
  "LOCAL_DB_PORT",
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "COOLIFY_URL",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "EMAIL_MODE",
  "EMAIL_ALLOWLIST",
  "SEED_ADMIN_EMAIL",
  "SEED_ADMIN_PASSWORD",
]);

export type DeclaredKey = { key: string; required: boolean };

/** The keys an app needs, read from its .env.example. */
export function declaredKeys(envExample: string): DeclaredKey[] {
  const keys: DeclaredKey[] = [];
  let comments: string[] = [];
  for (const raw of envExample.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("#")) {
      comments.push(line);
      continue;
    }
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match && !KIT_MANAGED_KEYS.has(match[1])) {
      const optional = match[2].trim() !== "" || comments.some((c) => /\(optional\)/i.test(c));
      keys.push({ key: match[1], required: !optional });
    }
    comments = [];
  }
  return keys;
}

/** The key a file in the safe provides: "google-services.json" → GOOGLE_SERVICES_JSON. */
export function keyFromFileName(fileName: string): string {
  return fileName
    .replace(/^.*[\\/]/, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** The text of a file as one value. JSON is squeezed onto one line so it fits in a .env file. */
export function fileToValue(fileName: string, content: string): string {
  if (!/\.json$/i.test(fileName)) return content.trim();
  try {
    return JSON.stringify(JSON.parse(content));
  } catch {
    throw new Error(`${fileName} is not valid JSON.`);
  }
}

const TEST_PREFIX = /^(rzp_test_|sk_test_|pk_test_|rk_test_)/;
const LIVE_PREFIX = /^(rzp_live_|sk_live_|pk_live_|rk_live_)/;

/** Whether a value is visibly a test or a live (real money) key, e.g. Razorpay rzp_test_… / rzp_live_…. */
export function keyKind(value: string): "test" | "live" | "unknown" {
  if (TEST_PREFIX.test(value)) return "test";
  if (LIVE_PREFIX.test(value)) return "live";
  return "unknown";
}

/** A value written safely into a .env file (quoted when it has spaces, # or JSON). */
export function formatEnvValue(value: string): string {
  if (/^[A-Za-z0-9_\-.:/@+=,]*$/.test(value)) return value;
  if (!value.includes("'") && !value.includes("\n")) return `'${value}'`;
  throw new Error("This value has both a ' and a line break. Save it as a file in the key safe instead.");
}

/**
 * Fills the app's local .env with test keys it declares but doesn't have yet.
 * Never overwrites a value you set, and never copies a live key to your computer.
 */
export function fillLocalEnv(
  envText: string,
  declared: DeclaredKey[],
  testKeys: Record<string, string>,
): { text: string; filled: string[]; refusedLive: string[] } {
  const current = parse(envText);
  let text = envText;
  const filled: string[] = [];
  const refusedLive: string[] = [];
  for (const { key } of declared) {
    const value = testKeys[key];
    if (current[key] || !value) continue;
    if (keyKind(value) === "live") {
      refusedLive.push(key);
      continue;
    }
    text = setEnvValue(text, key, formatEnvValue(value));
    filled.push(key);
  }
  return { text, filled, refusedLive };
}

export type ServerKeyPlan = {
  /** Values for pull request previews (test keys), including empty placeholders, see below. */
  preview: Record<string, string>;
  /** Values for production (live keys). */
  production: Record<string, string>;
  /** Required keys production would not have. Release and launch refuse while this isn't empty. */
  missingProduction: string[];
  /** Keys previews won't have (no test key in the safe). Only a warning. */
  missingPreview: string[];
  /** A test key headed for production, or a live key headed for previews. Always refused. */
  problems: string[];
};

/**
 * Which key goes where on the server. Test keys → previews, live keys → production.
 * `existing` = key names Coolify already has (values can't be read with a normal token).
 *
 * Coolify copies a NEW production variable into previews unless a preview variable with that
 * name exists, which would put a live key into previews. So every production key without a
 * preview value gets an empty preview placeholder, created first.
 */
export function planServerKeys(
  declared: DeclaredKey[],
  testKeys: Record<string, string>,
  liveKeys: Record<string, string>,
  existing: { production: Set<string>; preview: Set<string> },
): ServerKeyPlan {
  const plan: ServerKeyPlan = { preview: {}, production: {}, missingProduction: [], missingPreview: [], problems: [] };
  for (const { key, required } of declared) {
    const test = testKeys[key];
    const live = liveKeys[key];

    if (test && keyKind(test) === "live") plan.problems.push(`${key}: your TEST keys (test.env) hold a live key. Previews must never use live keys.`);
    else if (test) plan.preview[key] = test;
    else plan.missingPreview.push(key);

    if (live && keyKind(live) === "test") plan.problems.push(`${key}: your LIVE keys (prod.env) hold a test key. Production needs the live one.`);
    else if (live) plan.production[key] = live;
    else if (required && !existing.production.has(key)) plan.missingProduction.push(key);
  }
  for (const key of Object.keys(plan.production)) {
    if (!(key in plan.preview) && !existing.preview.has(key)) plan.preview[key] = "";
  }
  return plan;
}

/** The message shown when production keys are missing or wrong. */
export function explainKeyProblems(plan: ServerKeyPlan): string | null {
  if (plan.missingProduction.length === 0 && plan.problems.length === 0) return null;
  const lines = [...plan.problems];
  if (plan.missingProduction.length) {
    lines.push(
      `Production needs these live keys: ${plan.missingProduction.join(", ")}.`,
      "  Add them to ~/.config/app-factory/prod.env (or as files in ~/.config/app-factory/prod/),",
      "  e.g. in a terminal:  pnpm keys set " + plan.missingProduction[0] + " --live",
      "  Then run this again. (pnpm keys shows what's missing.)",
    );
  }
  return lines.join("\n");
}
