/**
 * pnpm dev
 *
 * Starts everything for local development, and fixes the usual problems by itself:
 *   - no .env yet (e.g. a fresh clone on a new computer)? Makes one with a fresh secret.
 *   - Docker not running? Says how to start it.
 *   - database port already used by another project? Moves this project to a free port.
 *   - keys the app needs (from .env.example) but .env lacks? Copies them from your test keys.
 * Then: local database (Docker) → migrations → admin account → Next.js dev server.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomSecret } from "./lib/launch-plan";
import { makeLocalEnv, moveLocalDatabasePort, parseDockerPorts, readEnvValue } from "./lib/local-env";
import { findFreePort, isPortFree, run, runVisible } from "./lib/shell";
import { fillLocalEnv } from "./lib/vault";
import { appDeclaredKeys, loadVault } from "./lib/vault-store";

const COMPOSE = ["compose", "-f", "docker-compose.dev.yml"];

function step(command: string, args: string[]) {
  try {
    runVisible(command, args);
  } catch {
    console.error(`\n[dev] "${command} ${args.join(" ")}" failed (see above). Run pnpm checkup, or ask Claude for help.`);
    process.exit(1);
  }
}

/** Ports held by Docker containers (empty if Docker isn't running yet). */
function dockerPorts(): Set<number> {
  try {
    return parseDockerPorts(run("docker", ["ps", "--format", "{{.Ports}}"]));
  } catch {
    return new Set();
  }
}

async function main() {
  if (!existsSync(".env")) {
    const port = await findFreePort(5433, dockerPorts());
    writeFileSync(".env", makeLocalEnv(readFileSync(".env.example", "utf8"), port, randomSecret(48)));
    console.log(`==> Made a .env for this computer (local database on port ${port})`);
  }

  // Test keys from your key safe (~/.config/app-factory/test.env) for keys this app lists in .env.example.
  const keys = fillLocalEnv(readFileSync(".env", "utf8"), appDeclaredKeys(), loadVault("test"));
  if (keys.filled.length) {
    writeFileSync(".env", keys.text);
    console.log(`==> Added your test keys to .env: ${keys.filled.join(", ")}`);
  }
  if (keys.refusedLive.length) {
    console.log(`!! Not copied (they are LIVE keys in your test keys file): ${keys.refusedLive.join(", ")}. Run pnpm keys.`);
  }

  let env = readFileSync(".env", "utf8");
  const dbUrl = readEnvValue(env, "DATABASE_URL") ?? "";
  const isLocalDb = !dbUrl || dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1");

  if (isLocalDb) {
    try {
      run("docker", ["info"]);
  } catch {
    console.error(`
[dev] Docker is not running, and the local database needs it.
      Start Docker Desktop (or on Linux:  sudo systemctl start docker), then run pnpm dev again.`);
    process.exit(1);
  }

  // Is the database port free? Fine if it's this project's own database already running.
  let env = readFileSync(".env", "utf8");
  const port = Number(readEnvValue(env, "LOCAL_DB_PORT") ?? 5433);
  const ownDatabaseRunning = run("docker", [...COMPOSE, "ps", "--status", "running", "--quiet"]) !== "";
  const taken = dockerPorts();
  if (!ownDatabaseRunning && (taken.has(port) || !(await isPortFree(port)))) {
    const newPort = await findFreePort(port + 1, taken);
    env = moveLocalDatabasePort(env, newPort);
    writeFileSync(".env", env);
    console.log(`==> Port ${port} is used by something else (another project?). Moved this project's database to ${newPort}.`);
  }

  console.log("==> Starting the local database");
  step("docker", [...COMPOSE, "up", "-d", "--wait"]);
  } else {
    console.log("==> Using remote database");
  }
  step("pnpm", ["db:migrate"]);
  step("pnpm", ["db:seed"]);

  console.log(`
==> Starting the app at http://localhost:3000  (Ctrl+C to stop)
    Emails are not sent on your computer: links are printed here instead.
`);
  const dev = spawnSync("pnpm", ["exec", "next", "dev"], { stdio: "inherit", shell: process.platform === "win32" });
  process.exit(dev.status ?? 0);
}

main().catch((error: unknown) => {
  console.error(`\n[dev] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
