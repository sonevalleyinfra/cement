/**
 * Plain rules used by `pnpm ship`, `pnpm release` and `pnpm status`.
 * No network, no git: everything here is easy to test.
 */
import { checkBackup } from "./launch-plan";

/**
 * A git branch name made from a change description, e.g. "Add products page!" → "add-products-page".
 * Adds -2, -3, ... when the name is already taken.
 */
export function branchNameFromMessage(message: string, taken: Iterable<string>): string {
  let slug = message
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length > 40) {
    // Cut at 40 characters without leaving half a word.
    const cut = slug.slice(0, 40);
    slug = slug[40] === "-" ? cut : cut.replace(/-[^-]*$/, "") || cut;
  }
  slug = slug.replace(/-+$/, "") || "change";

  const used = new Set(taken);
  if (!used.has(slug)) return slug;
  for (let n = 2; ; n++) {
    if (!used.has(`${slug}-${n}`)) return `${slug}-${n}`;
  }
}

/** One entry of `gh pr view --json statusCheckRollup`: a GitHub Actions check run or a commit status. */
export type CheckItem = {
  __typename?: string;
  name?: string;
  context?: string;
  status?: string;
  conclusion?: string | null;
  state?: string;
};

export type CheckState = "passed" | "failed" | "pending" | "none";

const OK_CONCLUSIONS = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);

/** Overall result of a pull request's checks. Any failure wins, then anything still running. */
export function summarizeChecks(items: CheckItem[]): { state: CheckState; failed: string[] } {
  if (items.length === 0) return { state: "none", failed: [] };
  const failed: string[] = [];
  let pending = false;
  for (const item of items) {
    const label = item.name ?? item.context ?? "check";
    if (item.state !== undefined && item.status === undefined) {
      // Commit status (StatusContext)
      if (item.state === "SUCCESS") continue;
      if (item.state === "PENDING" || item.state === "EXPECTED") pending = true;
      else failed.push(label);
      continue;
    }
    // Check run
    if (item.status !== "COMPLETED") pending = true;
    else if (!OK_CONCLUSIONS.has(item.conclusion ?? "")) failed.push(label);
  }
  if (failed.length > 0) return { state: "failed", failed };
  return { state: pending ? "pending" : "passed", failed };
}

/**
 * True when database tables were changed (src/db/schema) but no new migration was made (drizzle/*.sql).
 * Without a migration the change never reaches the server's database.
 */
export function missingMigration(changedFiles: string[]): boolean {
  const schemaChanged = changedFiles.some(
    (file) => file.startsWith("src/db/schema/") && file.endsWith(".ts") && !file.endsWith(".test.ts"),
  );
  const migrationAdded = changedFiles.some((file) => file.startsWith("drizzle/") && file.endsWith(".sql"));
  return schemaChanged && !migrationAdded;
}

/**
 * File paths from `git status --porcelain` lines, e.g. " M src/a.ts", "?? new.ts", "R  old.ts -> new.ts".
 */
export function pathsFromPorcelain(output: string): string[] {
  return output
    .split("\n")
    .filter((line) => line.length > 3)
    .map((line) => line.slice(3))
    .map((file) => (file.includes(" -> ") ? file.split(" -> ")[1] : file))
    .map((file) => file.replace(/^"|"$/g, ""));
}

/**
 * The preview address of a pull request. launch.ts keeps Coolify's default preview template
 * {{pr_id}}.{{domain}}, so PR 7 of https://my-shop.example.com is https://7.my-shop.example.com.
 */
export function previewUrl(productionUrl: string, prNumber: number): string {
  const url = new URL(productionUrl);
  return `${url.protocol}//${prNumber}.${url.host}`;
}

/** First URL of Coolify's comma-separated `fqdn` field. */
export function firstUrl(fqdn: string | null | undefined): string | undefined {
  const first = fqdn?.split(",")[0]?.trim();
  if (!first) return undefined;
  return new URL(/^https?:\/\//i.test(first) ? first : `https://${first}`).origin;
}

/** One entry of Coolify's GET /deployments/applications/{uuid}, newest first. */
export type Deployment = {
  commit?: string | null;
  pull_request_id?: number | null;
  status: string;
  deployment_url?: string | null;
  created_at?: string;
};

/**
 * The newest deployment of `commit`. `prNumber` 0 means production; previews use the PR number.
 */
export function findDeployment(deployments: Deployment[], commit: string, prNumber: number): Deployment | undefined {
  return deployments.find((d) => d.commit === commit && (d.pull_request_id ?? 0) === prNumber);
}

/** queued / in_progress → still waiting; finished → done; anything else (failed, cancelled) → failed. */
export function deploymentOutcome(status: string): "waiting" | "done" | "failed" {
  if (status === "queued" || status === "in_progress") return "waiting";
  return status === "finished" ? "done" : "failed";
}

/**
 * What is wrong with the production backups, or null when the last one is fine and recent.
 * Backups run nightly, so one older than 26 hours means a night was missed.
 */
export function backupProblem(
  executions: { status?: string; message?: string | null; created_at?: string }[],
  savesToS3: boolean,
  now: Date,
): string | null {
  const latest = executions[0];
  if (!latest) return "no backup has run yet";
  const check = checkBackup(latest, savesToS3);
  if (!check.ok) return check.problem;
  if (latest.created_at) {
    const hours = (now.getTime() - new Date(latest.created_at).getTime()) / 3_600_000;
    if (hours > 26) return `the last backup is ${Math.floor(hours)} hours old (one should run every night)`;
  }
  return null;
}

export type ProjectState = {
  onDefaultBranch: boolean;
  uncommittedFiles: number;
  unpushedCommits: number;
  pullRequest?: { number: number; checks: CheckState };
  launched: boolean;
  productionHealthy?: boolean;
};

/** The one thing to do next, in plain words. Shown at the end of `pnpm status`. */
export function nextStep(state: ProjectState): string {
  if (state.launched && state.productionHealthy === false) {
    return 'Production is not answering. Ask Claude: "production is down, please check Coolify".';
  }
  if (state.uncommittedFiles > 0 || state.unpushedCommits > 0) {
    return 'You have changes that are not sent yet. Run: pnpm ship "what you changed"';
  }
  const pr = state.pullRequest;
  if (pr) {
    if (pr.checks === "failed") return `Checks failed on PR #${pr.number}. Ask Claude: "fix the failing checks".`;
    if (pr.checks === "pending") return `Checks are still running on PR #${pr.number}. Run pnpm status again in a minute.`;
    return `PR #${pr.number} is ready. Try it${state.launched ? " on its preview" : ""}, then run: pnpm release`;
  }
  if (!state.launched) return "When you want the app on the internet, run: pnpm launch";
  return 'All good. Edit some code, then run: pnpm ship "what you changed"';
}
