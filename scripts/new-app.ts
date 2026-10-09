/**
 * pnpm new-app <name> [--launch] [--no-dev]
 *
 * Starts a brand-new project from this template, on your computer:
 *   1. creates a private GitHub repo <name> from the template (with security alerts on),
 *   2. clones it next to this folder (../<name>),
 *   3. writes a .env with a fresh secret and its own local database port,
 *   4. installs packages, optionally puts it online (--launch), and runs `pnpm dev`.
 * Without --launch nothing is created on Coolify. Run `pnpm launch` inside the project later.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setUpGithubRepo } from "./lib/github-setup";
import { randomSecret, validateAppName } from "./lib/launch-plan";
import { makeLocalEnv, parseDockerPorts } from "./lib/local-env";
import { findFreePort, requireTool, run, runVisible, sleep } from "./lib/shell";

async function main() {
  const name = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  const launch = process.argv.includes("--launch");
  const nameError = validateAppName(name);
  if (nameError) throw new Error(nameError);

  requireTool("gh", "Install the GitHub CLI and run: gh auth login");
  requireTool("docker", "Install Docker and make sure it is running.");

  // Which repo is the template? This one, or the template this project was made from.
  const here = JSON.parse(run("gh", ["repo", "view", "--json", "nameWithOwner,isTemplate,templateRepository"])) as {
    nameWithOwner: string;
    isTemplate: boolean;
    templateRepository: { name: string; owner: { login: string } } | null;
  };
  const template = here.isTemplate
    ? here.nameWithOwner
    : here.templateRepository
      ? `${here.templateRepository.owner.login}/${here.templateRepository.name}`
      : null;
  if (!template) throw new Error(`${here.nameWithOwner} is not a template repo. Run this from the app-starter template.`);
  const owner = template.split("/")[0];
  const repo = `${owner}/${name}`;

  const target = path.resolve(process.cwd(), "..", name!);
  if (existsSync(target)) throw new Error(`The folder ${target} already exists. Pick another name.`);

  console.log(`==> Creating private GitHub repo ${repo} from ${template}`);
  run("gh", ["repo", "create", repo, "--private", "--template", template]);
  setUpGithubRepo(repo);

  // GitHub copies the template in the background. Wait until the branch exists before cloning.
  for (let attempt = 1; ; attempt++) {
    const branches = JSON.parse(run("gh", ["api", `repos/${repo}/branches`])) as unknown[];
    if (branches.length > 0) break;
    if (attempt === 20) throw new Error(`GitHub has not finished copying the template into ${repo}. Try: gh repo clone ${repo}`);
    await sleep(2000);
  }

  console.log(`==> Cloning into ${target}`);
  run("gh", ["repo", "clone", repo, target]);

  console.log("==> Writing .env (fresh secret, own local database port)");
  let usedByDocker = new Set<number>();
  try {
    usedByDocker = parseDockerPorts(run("docker", ["ps", "--format", "{{.Ports}}"]));
  } catch {
    // Docker not running yet: pnpm dev will say so.
  }
  const dbPort = await findFreePort(5433, usedByDocker);
  const example = readFileSync(path.join(target, ".env.example"), "utf8");
  writeFileSync(path.join(target, ".env"), makeLocalEnv(example, dbPort, randomSecret(48)));

  console.log("==> Installing packages");
  runVisible("pnpm", ["install"], { cwd: target });

  if (launch) {
    console.log("==> Putting it online (pnpm launch)");
    const launched = spawnSync("pnpm", ["launch"], { cwd: target, stdio: "inherit" });
    if (launched.status !== 0) console.log("!! Launch did not finish (see above). Your project still works locally.");
  }

  console.log(`
==> Ready. Your project is in ${target}
    Open that folder in your editor. Next time, start it with:  pnpm dev
    Send a change for review:  pnpm ship "what you changed"   ·   put it live:  pnpm release${
      launch ? "" : "\n    When you want it online, run inside it:  pnpm launch"
    }

==> Starting the dev server (Ctrl+C to stop)
`);
  if (process.argv.includes("--no-dev")) return; // e.g. when Claude runs it: start pnpm dev separately
  const dev = spawnSync("pnpm", ["dev"], { cwd: target, stdio: "inherit" });
  process.exit(dev.status ?? 0);
}

main().catch((error: unknown) => {
  console.error(`\n[new-app] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
