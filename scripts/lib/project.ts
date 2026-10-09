/**
 * Finding out about the current project: its GitHub repo, pull requests, checks,
 * and (when a Coolify token is set up) its app and deployments on the server.
 * Used by ship, release and status. The decisions live in workflow-rules.ts.
 */
import type { Coolify } from "./coolify-api";
import { run, sleep } from "./shell";
import {
  deploymentOutcome,
  findDeployment,
  firstUrl,
  summarizeChecks,
  type CheckItem,
  type CheckState,
  type Deployment,
} from "./workflow-rules";

/**
 * Reads JSON from the GitHub CLI. Retries a few times, because one dropped connection
 * shouldn't stop a command. Only for reads: they are safe to repeat.
 */
function ghJson<T>(args: string[], cwd?: string): T {
  for (let attempt = 1; ; attempt++) {
    try {
      return JSON.parse(run("gh", args, { cwd })) as T;
    } catch (error) {
      if (attempt >= 4) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000 * attempt); // pause, then retry
    }
  }
}

export type Repo = { name: string; nameWithOwner: string; defaultBranch: string; homepageUrl: string };

export function getRepo(cwd?: string): Repo {
  const repo = ghJson<{ name: string; nameWithOwner: string; defaultBranchRef: { name: string }; homepageUrl: string | null }>(
    ["repo", "view", "--json", "name,nameWithOwner,defaultBranchRef,homepageUrl"],
    cwd,
  );
  return { ...repo, defaultBranch: repo.defaultBranchRef.name, homepageUrl: repo.homepageUrl ?? "" };
}

export function currentBranch(): string {
  const branch = run("git", ["branch", "--show-current"]);
  if (!branch) throw new Error("You are not on a branch (detached HEAD). Run: git switch master");
  return branch;
}

/** Claude Code keeps scratch copies of the repo here. They are never part of your changes. */
export const IGNORED_PATHSPEC = ":!.claude/worktrees";

/** Files changed but not committed yet (including new files), as `git status --porcelain` lines. */
export function uncommittedChanges(cwd?: string): string {
  return run("git", ["status", "--porcelain", "--", ".", IGNORED_PATHSPEC], { cwd });
}

/** Commits on this branch that are not on GitHub yet. */
export function unpushedCommits(defaultBranch: string): number {
  try {
    return Number(run("git", ["rev-list", "--count", "@{upstream}..HEAD"]));
  } catch {
    // Branch never pushed: count what is not on GitHub's default branch.
    try {
      return Number(run("git", ["rev-list", "--count", `origin/${defaultBranch}..HEAD`]));
    } catch {
      return 0;
    }
  }
}

export type PullRequest = {
  number: number;
  title: string;
  url: string;
  state: string;
  headRefName: string;
  mergeable: string;
  statusCheckRollup: CheckItem[];
};

const PR_FIELDS = "number,title,url,state,headRefName,mergeable,statusCheckRollup";

/** The open pull request for a branch, if there is one. */
export function findPullRequest(branch: string): PullRequest | undefined {
  return ghJson<PullRequest[]>(["pr", "list", "--head", branch, "--state", "open", "--json", PR_FIELDS])[0];
}

export function getPullRequest(number: number): PullRequest {
  return ghJson<PullRequest>(["pr", "view", String(number), "--json", PR_FIELDS]);
}

export function openPullRequests(): PullRequest[] {
  return ghJson<PullRequest[]>(["pr", "list", "--state", "open", "--json", PR_FIELDS]);
}

/**
 * Runs `attempt` again (every 15 s) when the network hiccups, so a long wait isn't lost
 * to one failed request. Gives up after `tries` failures in a row.
 */
async function withRetries<T>(attempt: () => T | Promise<T>, tries = 8): Promise<T> {
  for (let failures = 1; ; failures++) {
    try {
      return await attempt();
    } catch (error) {
      if (failures >= tries) throw error;
      console.log("    (network hiccup, trying again)");
      await sleep(15_000);
    }
  }
}

/**
 * Waits until the pull request's checks (lint, typecheck, tests, build on GitHub) are done.
 * "none" only counts once GitHub has had 2 minutes to start them.
 */
export async function waitForChecks(prNumber: number, timeoutMs = 20 * 60_000): Promise<{ state: CheckState; failed: string[] }> {
  const started = Date.now();
  let shown = false;
  for (;;) {
    const pr = await withRetries(() => getPullRequest(prNumber));
    const summary = summarizeChecks(pr.statusCheckRollup ?? []);
    const waitingToStart = summary.state === "none" && Date.now() - started < 2 * 60_000;
    if (summary.state !== "pending" && !waitingToStart) return summary;
    if (Date.now() - started > timeoutMs) return { state: "pending", failed: [] };
    if (!shown) {
      console.log("    GitHub is checking the code (lint, types, tests, build). This takes 2-4 minutes...");
      shown = true;
    }
    await sleep(15_000);
  }
}

export type CoolifyApp = { uuid: string; name: string; git_repository: string; fqdn: string | null; status: string };

/** The Coolify app built from this GitHub repo, or undefined (not launched, or no Coolify token). */
export async function findCoolifyApp(coolify: Coolify | undefined, repo: Repo): Promise<CoolifyApp | undefined> {
  if (!coolify) return undefined;
  const apps = await coolify.request<CoolifyApp[]>("GET", "/applications");
  return apps.find((app) => app.git_repository === repo.nameWithOwner);
}

/** The production address: from Coolify when possible, otherwise the repo's homepage (set by launch). */
export function productionUrl(repo: Repo, app: CoolifyApp | undefined): string | undefined {
  return firstUrl(app?.fqdn) ?? firstUrl(repo.homepageUrl);
}

export async function isHealthy(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(8000) });
    return response.ok;
  } catch {
    return false;
  }
}

/** Newest deployments of a Coolify app (production and previews), newest first. */
export async function listDeployments(coolify: Coolify, appUuid: string): Promise<Deployment[]> {
  const answer = await coolify.request<{ deployments?: Deployment[] } | Deployment[]>(
    "GET",
    `/deployments/applications/${appUuid}?skip=0&take=20`,
  );
  return Array.isArray(answer) ? answer : (answer.deployments ?? []);
}

/**
 * Waits for Coolify to build and start `commit`. `prNumber` 0 = production, otherwise that PR's preview.
 * Returns the deployment link too, so a failure can point at its log.
 */
export async function waitForDeployment(
  coolify: Coolify,
  appUuid: string,
  commit: string,
  prNumber: number,
  timeoutMs = 25 * 60_000,
): Promise<{ outcome: "done" | "failed" | "timeout"; link?: string }> {
  const started = Date.now();
  let shown = "";
  while (Date.now() - started < timeoutMs) {
    const deployments = await withRetries(() => listDeployments(coolify, appUuid));
    const deployment = findDeployment(deployments, commit, prNumber);
    const status = deployment?.status ?? "waiting for GitHub to tell Coolify";
    if (status !== shown) {
      console.log(`    server: ${status.replaceAll("_", " ")}`);
      shown = status;
    }
    if (deployment) {
      const outcome = deploymentOutcome(deployment.status);
      const link = deployment.deployment_url ? `${coolify.baseUrl}${deployment.deployment_url}` : undefined;
      if (outcome !== "waiting") return { outcome, link };
    }
    await sleep(10_000);
  }
  return { outcome: "timeout" };
}
