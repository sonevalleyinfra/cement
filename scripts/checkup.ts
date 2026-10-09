/**
 * pnpm checkup
 *
 * Checks that this computer is ready, and says exactly how to fix anything that isn't.
 * Read-only: it never changes anything, and never prints secrets.
 */
import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";
import { parseEnv } from "@/lib/env-schema";
import { connectToCoolify, readOptionalConfigFile } from "./lib/coolify-api";
import { run } from "./lib/shell";
import { loadVault, VAULT_DIR } from "./lib/vault-store";

type Result = { ok: boolean; label: string; fix?: string; optional?: boolean };

function tryRun(command: string, args: string[]): string | undefined {
  try {
    return run(command, args);
  } catch {
    return undefined;
  }
}

async function main() {
  const results: Result[] = [];
  const add = (ok: boolean, label: string, fix?: string, optional = false) => results.push({ ok, label, fix, optional });

  // ---- Tools ----
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  add(nodeMajor >= 24, `Node.js ${process.versions.node}`, "Install Node.js 24 or newer from https://nodejs.org");
  add(Boolean(tryRun("pnpm", ["--version"])), "pnpm", "Run: corepack enable");
  add(Boolean(tryRun("git", ["config", "user.email"])), "git knows who you are", 'Run: git config --global user.email "you@example.com"');
  add(Boolean(tryRun("gh", ["auth", "status"])), "GitHub CLI is logged in", "Install the GitHub CLI (https://cli.github.com), then run: gh auth login");
  add(Boolean(tryRun("docker", ["--version"])), "Docker is installed", "Install Docker Desktop: https://docs.docker.com/get-docker/");
  add(Boolean(tryRun("docker", ["info"])), "Docker is running", "Start Docker Desktop (or on Linux: sudo systemctl start docker)");

  // ---- This project's local settings ----
  if (existsSync(".env")) {
    try {
      parseEnv({ ...parse(readFileSync(".env")), NODE_ENV: "development" });
      add(true, ".env settings are valid");
    } catch (error) {
      add(false, ".env settings", error instanceof Error ? error.message : String(error));
    }
  } else {
    add(true, ".env (none yet: pnpm dev will make one)");
  }

  // ---- Going online (pnpm launch, and the extra detail in ship / release / status) ----
  const url = readOptionalConfigFile("coolify_url.txt");
  add(Boolean(url), "Coolify address (~/.config/coolify/coolify_url.txt)", "Put your Coolify address in it, e.g. https://coolify.example.com", true);
  if (url && readOptionalConfigFile("coolify_token.txt")) {
    try {
      const version = await connectToCoolify().request<string>("GET", "/version");
      add(true, `Coolify token works (Coolify ${version})`);
    } catch (error) {
      add(false, "Coolify token", error instanceof Error ? error.message.split("\n")[0] : String(error), true);
    }
  } else {
    add(false, "Coolify token (~/.config/coolify/coolify_token.txt)", "Needed for pnpm launch. See docs/GUIDE.md section 5.", true);
  }
  add(Boolean(readOptionalConfigFile("resend_api_key.txt")), "Resend key for real email (~/.config/coolify/resend_api_key.txt)", "Needed so launched apps can send email. See docs/GUIDE.md section 2.", true);
  add(Boolean(readOptionalConfigFile("email_domain.txt")), "Email domain (~/.config/coolify/email_domain.txt)", "The domain verified in Resend, e.g. mail.example.com", true);

  // ---- Key safe (test and live keys shared by all apps) ----
  try {
    const test = Object.keys(loadVault("test")).length;
    const live = Object.keys(loadVault("live")).length;
    add(
      existsSync(VAULT_DIR),
      `Key safe ${VAULT_DIR} (${test} test, ${live} live keys)`,
      "Run pnpm keys to create it (only needed when an app uses Razorpay, LiveKit, Google...).",
      true,
    );
  } catch (error) {
    add(false, "Key safe", error instanceof Error ? error.message : String(error), true);
  }

  // ---- Report ----
  console.log("");
  for (const r of results) {
    console.log(`${r.ok ? "✓" : r.optional ? "·" : "✗"} ${r.label}`);
    if (!r.ok && r.fix) console.log(`    → ${r.fix.replaceAll("\n", "\n      ")}`);
  }
  const problems = results.filter((r) => !r.ok && !r.optional).length;
  console.log(
    problems === 0
      ? "\nAll set for development." + (results.some((r) => !r.ok) ? " (· = only needed to go online)" : "")
      : `\n${problems} thing(s) to fix before pnpm dev works.`,
  );
  process.exit(problems === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(`\n[checkup] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
