/**
 * pnpm status
 *
 * Everything about this project on one screen: is production up, are backups fine,
 * what is waiting in pull requests, what is not sent yet, and what to do next.
 * Read-only: it never changes anything.
 */
import { formatDateTime } from "@/lib/datetime";
import { connectToCoolifyIfSetUp, type Coolify } from "./lib/coolify-api";
import {
  currentBranch,
  findCoolifyApp,
  getRepo,
  isHealthy,
  listDeployments,
  openPullRequests,
  productionUrl,
  uncommittedChanges,
  unpushedCommits,
  type CoolifyApp,
  type Repo,
} from "./lib/project";
import { requireTool, run } from "./lib/shell";
import {
  backupProblem,
  nextStep,
  pathsFromPorcelain,
  previewUrl,
  summarizeChecks,
  type CheckState,
} from "./lib/workflow-rules";

type Database = { uuid: string; name: string; status?: string };
type BackupConfig = {
  enabled: boolean;
  save_s3: boolean;
  executions?: { status?: string; message?: string | null; created_at?: string }[];
};

const CHECK_LABEL: Record<CheckState, string> = {
  passed: "✓ checks passed",
  failed: "✗ checks FAILED",
  pending: "… checks running",
  none: "no checks yet",
};

const ok = (good: boolean) => (good ? "✓" : "✗");

async function serverDetails(coolify: Coolify, repo: Repo, app: CoolifyApp) {
  const lines: string[] = [`  App status:   ${app.status.replace(":", ", ")}`];

  const deployments = await listDeployments(coolify, app.uuid);
  const lastProduction = deployments.find((d) => (d.pull_request_id ?? 0) === 0);
  if (lastProduction) {
    const when = lastProduction.created_at ? `, ${formatDateTime(lastProduction.created_at)} IST` : "";
    lines.push(`  Last deploy:  ${lastProduction.status.replaceAll("_", " ")}${when}`);
  }

  const database = (await coolify.request<Database[]>("GET", "/databases")).find((db) => db.name === `${repo.name}-db`);
  if (database) {
    lines.push(`  Database:     ${database.status?.replace(":", ", ") ?? "unknown"}`);
    const backups = await coolify.request<BackupConfig[]>("GET", `/databases/${database.uuid}/backups`);
    const nightly = backups.find((b) => b.enabled);
    const problem = nightly
      ? backupProblem(nightly.executions ?? [], nightly.save_s3, new Date())
      : "no nightly backup is scheduled";
    lines.push(`  Backups:      ${problem ? `✗ ${problem}` : `✓ last night's backup is fine${nightly?.save_s3 ? " (copied off-site)" : ""}`}`);
  }
  return lines;
}

async function main() {
  requireTool("gh", "Install the GitHub CLI and run: gh auth login");
  const repo = getRepo();
  const main = repo.defaultBranch;
  const branch = currentBranch();
  try {
    run("git", ["fetch", "--quiet", "origin"]);
  } catch {
    // Offline: show what we know.
  }

  console.log(`\n${repo.nameWithOwner}\n`);

  // ---- Production ----
  const coolify = connectToCoolifyIfSetUp();
  let app: CoolifyApp | undefined;
  let coolifyError = "";
  try {
    app = await findCoolifyApp(coolify, repo);
  } catch (error) {
    coolifyError = error instanceof Error ? error.message.split("\n")[0] : String(error);
  }
  const production = productionUrl(repo, app);
  let healthy: boolean | undefined;

  console.log("PRODUCTION");
  if (!production) {
    console.log("  Not online yet. Run pnpm launch when you want it on the internet.");
  } else {
    healthy = await isHealthy(production);
    console.log(`  ${ok(healthy)} ${production} ${healthy ? "is up" : "is NOT answering"}`);
    if (coolify && app) {
      try {
        for (const line of await serverDetails(coolify, repo, app)) console.log(line);
      } catch (error) {
        console.log(`  (could not read Coolify: ${error instanceof Error ? error.message.split("\n")[0] : error})`);
      }
    } else if (coolifyError) {
      console.log(`  (could not read Coolify: ${coolifyError})`);
    } else {
      console.log("  (add a Coolify token to see deploys and backups here: see docs/GUIDE.md section 5)");
    }
  }

  // ---- Pull requests ----
  const prs = openPullRequests();
  console.log("\nPULL REQUESTS");
  if (prs.length === 0) console.log("  none open");
  for (const pr of prs) {
    const checks = summarizeChecks(pr.statusCheckRollup ?? []).state;
    console.log(`  #${pr.number} ${pr.title}`);
    console.log(`      ${CHECK_LABEL[checks]}${production ? ` · preview ${previewUrl(production, pr.number)}` : ""}`);
  }

  // ---- This computer ----
  const changes = pathsFromPorcelain(uncommittedChanges());
  const unpushed = unpushedCommits(main);
  console.log("\nTHIS COMPUTER");
  console.log(`  Branch: ${branch}${branch === main ? " (main branch)" : ""}`);
  console.log(`  ${changes.length} changed file(s) not sent yet${unpushed ? `, ${unpushed} commit(s) not on GitHub` : ""}`);

  const prForBranch = prs.find((pr) => pr.headRefName === branch);
  console.log(
    `\nNEXT: ${nextStep({
      onDefaultBranch: branch === main,
      uncommittedFiles: changes.length,
      unpushedCommits: unpushed,
      pullRequest: prForBranch
        ? { number: prForBranch.number, checks: summarizeChecks(prForBranch.statusCheckRollup ?? []).state }
        : undefined,
      launched: Boolean(production),
      productionHealthy: healthy,
    })}\n`,
  );
}

main().catch((error: unknown) => {
  console.error(`\n[status] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
