/**
 * pnpm keys                          which keys this app needs, and where each one is set (never shows values)
 * pnpm keys set <NAME> --test|--live type a key into your key safe (hidden while you type/paste)
 * pnpm keys add-file <path> --test|--live   put a file (e.g. google-services.json) in the key safe
 * pnpm keys push                     send this app's keys to Coolify now (test → previews, live → production)
 *
 * The key safe is ~/.config/app-factory/ (see scripts/lib/vault-store.ts). You can also edit
 * test.env and prod.env there in your editor. `pnpm dev`, `ship`, `release` and `launch` use it by themselves.
 */
import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";
import { connectToCoolifyIfSetUp } from "./lib/coolify-api";
import { findCoolifyApp, getRepo } from "./lib/project";
import { explainKeyProblems, keyKind, planServerKeys } from "./lib/vault";
import {
  addVaultFile,
  appDeclaredKeys,
  coolifyKeyNames,
  ensureVault,
  loadVault,
  pushKeys,
  saveVaultValue,
  vaultFile,
  vaultFolder,
  VAULT_DIR,
  type VaultKind,
} from "./lib/vault-store";

function kindFromFlags(args: string[]): VaultKind {
  if (args.includes("--test")) return "test";
  if (args.includes("--live")) return "live";
  throw new Error("Say which half of the key safe: --test (computer + previews) or --live (production).");
}

/** Reads a line without showing it on screen (so a pasted key isn't visible or recorded). */
function askHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error(
      "This needs a real terminal window (it asks you to paste the key, hidden).\n" +
        "  Claude's ! box can't answer questions. Or edit the file in your editor: " + VAULT_DIR,
    );
  }
  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    let value = "";
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(value.trim());
          return;
        }
        if (char === "\u0003") process.exit(130); // Ctrl+C
        if (char === "\u007f") value = value.slice(0, -1); // Backspace
        else value += char;
      }
    };
    process.stdin.on("data", onData);
  });
}

async function showStatus() {
  if (ensureVault()) console.log(`==> Made your key safe in ${VAULT_DIR} (test.env, prod.env, test/, prod/).\n`);
  const declared = appDeclaredKeys();
  const test = loadVault("test");
  const live = loadVault("live");
  const local = existsSync(".env") ? parse(readFileSync(".env")) : {};

  let server: { production: Set<string>; preview: Set<string> } | undefined;
  try {
    const coolify = connectToCoolifyIfSetUp();
    const app = await findCoolifyApp(coolify, getRepo());
    if (coolify && app) server = await coolifyKeyNames(coolify, app.uuid);
  } catch {
    // Not launched, offline or no token: show the local columns only.
  }

  console.log(`Key safe: ${VAULT_DIR}  (${Object.keys(test).length} test keys, ${Object.keys(live).length} live keys)`);
  if (declared.length === 0) {
    console.log(`
This app doesn't use any extra keys yet. When you add an integration (payments, video, Google sign-in...),
its keys go in .env.example with an empty value, e.g.  RAZORPAY_KEY_ID=
Ask Claude: /integrate razorpay`);
    return;
  }

  const mark = (ok: boolean) => (ok ? "✓" : "✗");
  const width = Math.max(...declared.map((d) => d.key.length)) + 2;
  console.log(`\n${"KEY".padEnd(width)}computer  test  live${server ? "  previews  production" : ""}`);
  for (const { key, required } of declared) {
    const row = [
      `${key}${required ? "" : "?"}`.padEnd(width),
      mark(Boolean(local[key])).padEnd(10),
      mark(Boolean(test[key])).padEnd(6),
      mark(Boolean(live[key])).padEnd(6),
      server ? mark(server.preview.has(key)).padEnd(10) : "",
      server ? mark(server.production.has(key) || Boolean(live[key])) : "",
    ];
    console.log(row.join(""));
  }
  console.log("(? = optional)");

  const plan = planServerKeys(declared, test, live, server ?? { production: new Set(), preview: new Set() });
  const problems = explainKeyProblems(plan);
  if (problems) console.log(`\n!! Before release:\n${problems}`);
  const liveOnComputer = declared.filter((d) => local[d.key] && keyKind(local[d.key]) === "live").map((d) => d.key);
  if (liveOnComputer.length) console.log(`\n!! Your .env holds LIVE keys (${liveOnComputer.join(", ")}). Use test keys on your computer.`);
  console.log(`
Add or change keys:  pnpm keys set NAME --test   (or --live), in a real terminal
              or edit: ${vaultFile("test")}  /  ${vaultFile("live")}
Files (JSON):        pnpm keys add-file ./google-services.json --test   (stored in ${vaultFolder("test")})
Your computer gets new test keys on the next pnpm dev. Previews on the next pnpm ship, production on pnpm release.`);
}

async function push() {
  const coolify = connectToCoolifyIfSetUp();
  if (!coolify) throw new Error("No Coolify token set up (~/.config/coolify/coolify_token.txt).");
  const app = await findCoolifyApp(coolify, getRepo());
  if (!app) throw new Error("This app is not on Coolify yet. Run pnpm launch first.");
  const plan = planServerKeys(appDeclaredKeys(), loadVault("test"), loadVault("live"), await coolifyKeyNames(coolify, app.uuid));
  if (plan.problems.length) throw new Error(plan.problems.join("\n"));
  await pushKeys(coolify, app.uuid, plan, { production: true });
  console.log(`==> Sent ${Object.keys(plan.preview).length} preview and ${Object.keys(plan.production).length} production key(s) to Coolify.
    They take effect on the next deploy (pnpm ship / pnpm release, or Redeploy in Coolify).`);
  if (plan.missingProduction.length) console.log(`!! Production still needs: ${plan.missingProduction.join(", ")}`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command) return showStatus();

  if (command === "set") {
    const key = rest.find((arg) => !arg.startsWith("--"));
    if (!key || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error("Usage: pnpm keys set RAZORPAY_KEY_ID --test");
    const kind = kindFromFlags(rest);
    const value = await askHidden(`Paste the ${kind.toUpperCase()} value for ${key} (hidden), then Enter: `);
    if (!value) throw new Error("Nothing was pasted. Nothing saved.");
    if (kind === "test" && keyKind(value) === "live") throw new Error("That is a LIVE key. Use --live for it, and a test key here.");
    if (kind === "live" && keyKind(value) === "test") throw new Error("That is a TEST key. Use --test for it, and the live key here.");
    saveVaultValue(kind, key.toUpperCase(), value);
    console.log(`==> Saved ${key.toUpperCase()} in your ${kind} keys.`);
    return;
  }

  if (command === "add-file") {
    const file = rest.find((arg) => !arg.startsWith("--"));
    if (!file || !existsSync(file)) throw new Error("Usage: pnpm keys add-file ./google-services.json --test");
    const key = addVaultFile(kindFromFlags(rest), file);
    console.log(`==> Saved. Apps that list ${key}= in .env.example get this file's contents in that variable.
    You can now delete the original file (it must never be committed to git).`);
    return;
  }

  if (command === "push") return push();

  throw new Error(`Unknown: pnpm keys ${command}. Use: pnpm keys | set | add-file | push`);
}

main().catch((error: unknown) => {
  console.error(`\n[keys] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
