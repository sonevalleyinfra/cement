/**
 * pnpm release [PR number]
 *
 * Puts a pull request live, safely:
 *   1. refuses unless GitHub's checks passed and the pull request can be merged
 *      (the free GitHub plan cannot enforce this, so this command does),
 *   2. makes sure production has every live key the app needs (from your key safe), and refuses
 *      if one is missing or is a test key,
 *   3. merges it into the main branch and deletes its branch,
 *   4. brings your computer back to the main branch, up to date,
 *   5. waits until the new version is live in production (once the app is launched).
 * Without a number it releases the pull request of the branch you are on.
 */
import { connectToCoolifyIfSetUp } from "./lib/coolify-api";
import {
  currentBranch,
  findCoolifyApp,
  findPullRequest,
  getPullRequest,
  getRepo,
  isHealthy,
  openPullRequests,
  productionUrl,
  uncommittedChanges,
  unpushedCommits,
  waitForChecks,
  waitForDeployment,
  type PullRequest,
} from "./lib/project";
import { requireTool, run, runVisible, sleep } from "./lib/shell";
import { explainKeyProblems, planServerKeys } from "./lib/vault";
import { appDeclaredKeys, coolifyKeyNames, loadVault, pushKeys } from "./lib/vault-store";

async function main() {
  requireTool("gh", "Install the GitHub CLI and run: gh auth login");
  const repo = getRepo();
  const main = repo.defaultBranch;
  const branch = currentBranch();
  run("git", ["fetch", "--quiet", "origin"]);

  // ---- Which pull request? ----
  const numberArg = process.argv.slice(2).find((arg) => /^\d+$/.test(arg.replace(/^#/, "")));
  let pr: PullRequest | undefined = numberArg
    ? getPullRequest(Number(numberArg.replace(/^#/, "")))
    : branch === main
      ? undefined
      : findPullRequest(branch);
  if (!pr) {
    const open = openPullRequests();
    if (open.length === 1 && branch === main) {
      pr = open[0];
    } else if (open.length === 0) {
      throw new Error('There is no open pull request. Send your work first:  pnpm ship "what you changed"');
    } else {
      throw new Error(
        "Which pull request? Run  pnpm release <number>\n" +
          open.map((p) => `  #${p.number}  ${p.title}`).join("\n"),
      );
    }
  }
  if (pr.state !== "OPEN") throw new Error(`Pull request #${pr.number} is ${pr.state.toLowerCase()}, not open.`);
  console.log(`==> Releasing #${pr.number}: ${pr.title}`);

  if (pr.headRefName === branch && (uncommittedChanges() || unpushedCommits(main) > 0)) {
    throw new Error(
      'You have changes that are not in the pull request yet. Send them first:  pnpm ship "what you changed"\n' +
        "  (or undo them with  git stash  if you don't want them).",
    );
  }

  // ---- Only merge green, mergeable pull requests ----
  const checks = await waitForChecks(pr.number);
  if (checks.state === "failed") {
    throw new Error(
      `Not released: checks failed (${checks.failed.join(", ")}). Production is unchanged.\n` +
        `  See ${pr.url}/checks, or ask Claude: "the checks failed on PR #${pr.number}, please fix".`,
    );
  }
  if (checks.state !== "passed") {
    throw new Error(
      `Not released: GitHub's checks have not finished (${checks.state}). Production is unchanged.\n` +
        `  See ${pr.url}/checks and try again in a few minutes.`,
    );
  }
  console.log("    ✓ checks passed");

  // GitHub works out "mergeable" in the background; UNKNOWN means "ask again shortly".
  for (let attempt = 0; attempt < 10 && pr.mergeable === "UNKNOWN"; attempt++) {
    await sleep(3000);
    pr = getPullRequest(pr.number);
  }
  if (pr.mergeable === "CONFLICTING") {
    throw new Error(
      `Not released: #${pr.number} clashes with changes already on ${main} (a merge conflict).\n` +
        `  Ask Claude: "fix the merge conflicts on PR #${pr.number}", then run pnpm release again.`,
    );
  }

  // ---- Production keys (live keys from your key safe) ----
  const coolify = connectToCoolifyIfSetUp();
  const app = await findCoolifyApp(coolify, repo).catch(() => undefined);
  const declared = appDeclaredKeys();
  if (declared.length && coolify && app) {
    const plan = planServerKeys(declared, loadVault("test"), loadVault("live"), await coolifyKeyNames(coolify, app.uuid));
    const problems = explainKeyProblems(plan);
    if (problems) throw new Error(`Not released: production keys aren't ready. Production is unchanged.\n${problems}`);
    await pushKeys(coolify, app.uuid, plan, { production: true });
    console.log(`    ✓ production keys ready (${declared.length})`);
  } else if (declared.length && !coolify) {
    console.log("!! No Coolify token, so production keys can't be checked. Make sure Coolify has them.");
  }

  // ---- Merge ----
  console.log(`==> Merging into ${main}`);
  runVisible("gh", ["pr", "merge", String(pr.number), "--squash", "--delete-branch"]);
  if (currentBranch() === main) run("git", ["pull", "--quiet", "--ff-only", "origin", main]);
  const merged = JSON.parse(run("gh", ["pr", "view", String(pr.number), "--json", "mergeCommit"])) as {
    mergeCommit: { oid: string } | null;
  };

  // ---- Wait for production ----
  const production = productionUrl(repo, app);
  if (!production) {
    console.log(`\n==> Merged. The app is not online yet. When you want it on the internet, run: pnpm launch`);
    return;
  }

  console.log(`\n==> Putting it live at ${production} (2-5 minutes; Ctrl+C is safe, it carries on by itself)`);
  if (coolify && app && merged.mergeCommit) {
    const result = await waitForDeployment(coolify, app.uuid, merged.mergeCommit.oid, 0);
    if (result.outcome === "failed") {
      console.log(`
!! The new version did not build or start, so the OLD version is still running (users are fine).
   Log: ${result.link ?? "Coolify → your app → Deployments"}
   Ask Claude: "the production deploy failed, please check".`);
      process.exit(1);
    }
    if (result.outcome === "timeout") {
      console.log("    Still deploying after 25 minutes. Check Coolify → your app → Deployments.");
      return;
    }
    const healthy = await isHealthy(production);
    console.log(
      healthy
        ? `\n==> ✓ Live: ${production}`
        : `\n!! Deployed, but ${production}/api/health is not answering. Ask Claude to check.`,
    );
  } else {
    console.log(
      "    Coolify is building it now. Without a Coolify token this command can't follow along.\n" +
        "    If anything fails, the old version keeps running and Coolify emails you.",
    );
  }
}

main().catch((error: unknown) => {
  console.error(`\n[release] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
