/**
 * Your key safe: one place on THIS computer for the keys all your apps share.
 *
 *   ~/.config/app-factory/test.env   test keys (local development and pull request previews)
 *   ~/.config/app-factory/prod.env   live keys (production only)
 *   ~/.config/app-factory/test/      files, e.g. google-services.json → GOOGLE_SERVICES_JSON
 *   ~/.config/app-factory/prod/      the live versions of those files
 *
 * Only you can read these files (permissions 600). They are never committed or printed.
 * The rules (what goes where) are in vault.ts.
 */
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { parse } from "dotenv";
import type { Coolify } from "./coolify-api";
import { setEnvValue, toCoolifyEnvVars } from "./launch-plan";
import { declaredKeys, fileToValue, formatEnvValue, keyFromFileName, type DeclaredKey, type ServerKeyPlan } from "./vault";

export const VAULT_DIR = path.join(homedir(), ".config", "app-factory");
export type VaultKind = "test" | "live";

const FILE_NAME: Record<VaultKind, string> = { test: "test.env", live: "prod.env" };
const FOLDER: Record<VaultKind, string> = { test: "test", live: "prod" };

export const vaultFile = (kind: VaultKind) => path.join(VAULT_DIR, FILE_NAME[kind]);
export const vaultFolder = (kind: VaultKind) => path.join(VAULT_DIR, FOLDER[kind]);

const SKELETON = (kind: VaultKind) => `# ${
  kind === "test"
    ? "TEST keys, shared by all your apps: used on your computer and in pull request previews.\n# Never put live (real money) keys here."
    : "LIVE keys, shared by all your apps: used in production only."
}
# Only you can read this file. Never commit it, paste it in chat, or screenshot it.
# An app only receives the keys it lists in its .env.example. Remove the # to use a line.
# JSON files (e.g. Firebase) go in the ${FOLDER[kind]}/ folder next to this file:
#   firebase-service-account.json → FIREBASE_SERVICE_ACCOUNT_JSON

# Razorpay (${kind === "test" ? "Test mode" : "Live mode"}): dashboard.razorpay.com → Account & Settings → API keys
# RAZORPAY_KEY_ID=${kind === "test" ? "rzp_test_..." : "rzp_live_..."}
# RAZORPAY_KEY_SECRET=
# RAZORPAY_WEBHOOK_SECRET=

# LiveKit (video/audio calls): cloud.livekit.io → your project → Settings → Keys
# LIVEKIT_URL=wss://your-project.livekit.cloud
# LIVEKIT_API_KEY=
# LIVEKIT_API_SECRET=

# Sign in with Google: console.cloud.google.com → APIs & Services → Credentials → OAuth client ID (Web)
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=

# File storage (Cloudflare R2 or any S3)
# S3_ENDPOINT=
# S3_REGION=auto
# S3_BUCKET=
# S3_ACCESS_KEY_ID=
# S3_SECRET_ACCESS_KEY=

# SMS / OTP (MSG91)
# MSG91_AUTH_KEY=

# Error alerts (Sentry)
# SENTRY_DSN=
`;

/** Creates the key safe (folders and commented example files) if it doesn't exist. Returns true if it was new. */
export function ensureVault(): boolean {
  let created = false;
  mkdirSync(VAULT_DIR, { recursive: true, mode: 0o700 });
  for (const kind of ["test", "live"] as const) {
    mkdirSync(vaultFolder(kind), { recursive: true, mode: 0o700 });
    if (!existsSync(vaultFile(kind))) {
      writeFileSync(vaultFile(kind), SKELETON(kind), { mode: 0o600 });
      created = true;
    }
  }
  return created;
}

/** All keys in one half of the safe: the .env file plus its folder of files. Empty if there is no safe yet. */
export function loadVault(kind: VaultKind): Record<string, string> {
  const keys: Record<string, string> = {};
  if (existsSync(vaultFile(kind))) Object.assign(keys, parse(readFileSync(vaultFile(kind))));
  if (existsSync(vaultFolder(kind))) {
    for (const name of readdirSync(vaultFolder(kind))) {
      if (name.startsWith(".")) continue;
      keys[keyFromFileName(name)] = fileToValue(name, readFileSync(path.join(vaultFolder(kind), name), "utf8"));
    }
  }
  // An empty line like "RAZORPAY_KEY_ID=" means "not set".
  return Object.fromEntries(Object.entries(keys).filter(([, value]) => value !== ""));
}

/** Saves one key in the safe, keeping the file private. */
export function saveVaultValue(kind: VaultKind, key: string, value: string) {
  ensureVault();
  const content = readFileSync(vaultFile(kind), "utf8");
  writeFileSync(vaultFile(kind), setEnvValue(content, key, formatEnvValue(value)), { mode: 0o600 });
  chmodSync(vaultFile(kind), 0o600);
}

/** Copies a file (e.g. google-services.json) into the safe. Returns the key it provides. */
export function addVaultFile(kind: VaultKind, source: string): string {
  ensureVault();
  const name = path.basename(source);
  const content = readFileSync(source, "utf8");
  fileToValue(name, content); // checks JSON is valid before saving
  const target = path.join(vaultFolder(kind), name);
  writeFileSync(target, content, { mode: 0o600 });
  chmodSync(target, 0o600);
  return keyFromFileName(name);
}

/** The keys this app needs, from .env.example in the current folder. */
export function appDeclaredKeys(cwd = process.cwd()): DeclaredKey[] {
  const file = path.join(cwd, ".env.example");
  return existsSync(file) ? declaredKeys(readFileSync(file, "utf8")) : [];
}

/** The names (not values: those stay hidden) of the variables Coolify already has for an app. */
export async function coolifyKeyNames(coolify: Coolify, appUuid: string) {
  const envs = await coolify.request<{ key: string; is_preview: boolean }[]>("GET", `/applications/${appUuid}/envs`);
  return {
    production: new Set(envs.filter((e) => !e.is_preview).map((e) => e.key)),
    preview: new Set(envs.filter((e) => e.is_preview).map((e) => e.key)),
  };
}

/**
 * Writes the planned keys to Coolify: always previews first (see planServerKeys for why),
 * then production if asked. Takes effect on the next deploy.
 */
export async function pushKeys(coolify: Coolify, appUuid: string, plan: ServerKeyPlan, options: { production: boolean }) {
  const preview = toCoolifyEnvVars(plan.preview, true);
  const production = toCoolifyEnvVars(plan.production, false);
  if (preview.length) await coolify.request("PATCH", `/applications/${appUuid}/envs/bulk`, { data: preview });
  if (options.production && production.length) {
    await coolify.request("PATCH", `/applications/${appUuid}/envs/bulk`, { data: production });
  }
}
