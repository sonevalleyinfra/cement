/**
 * pnpm ship "what you changed"   [--no-wait]
 *
 * Sends your work for review in one go:
 *   1. runs the same checks as GitHub (lint, typecheck, tests, build) and stops if one fails,
 *   2. moves your work to a new branch if you are on the main branch,
 *   3. commits everything, pushes it to GitHub and opens a pull request (or updates it),
 *   4. waits for GitHub's checks and, once the app is launched, for the preview link.
 * Then try the preview and run `pnpm release` to put it live.
 */
import { connectToCoolifyIfSetUp } from "./lib/coolify-api";
import {
  currentBranch,
  findCoolifyApp,
  findPullRequest,
  getRepo,
  IGNORED_PATHSPEC,
  isHealthy,
  productionUrl,
  uncommittedChanges,
  unpushedCommits,
  waitForChecks,
  waitForDeployment,
} from "./lib/project";
import { requireTool, run, runVisible, sleep } from "./lib/shell";
import { planServerKeys } from "./lib/vault";
import { appDeclaredKeys, coolifyKeyNames, loadVault, pushKeys } from "./lib/vault-store";
import { branchNameFromMessage, missingMigration, pathsFromPorcelain, previewUrl } from "./lib/workflow-rules";

const CHECKS = ["lint", "typecheck", "test", "build"] as const;

/** Previews get the test keys the app needs, before the push starts their build. Never blocks shipping. */
async function givePreviewsTestKeys(repo: ReturnType<typeof getRepo>) {
  const declared = appDeclaredKeys();
  if (declared.length === 0) return;
  try {
    const coolify = connectToCoolifyIfSetUp();
    const app = await findCoolifyApp(coolify, repo);
    if (!coolify || !app) return;
    const plan = planServerKeys(declared, loadVault("test"), {}, await coolifyKeyNames(coolify, app.uuid));
    for (const problem of plan.problems) console.log(`!! ${problem}`);
    if (plan.problems.length === 0) await pushKeys(coolify, app.uuid, plan, { production: false });
    if (plan.missingPreview.length) {
      console.log(`!! Previews won't have: ${plan.missingPreview.join(", ")} (no test key). See pnpm keys.`);
    }
  } catch (error) {
    console.log(`!! Could not give previews their test keys (${error instanceof Error ? error.message.split("\n")[0] : error}).`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const wait = !args.includes("--no-wait");
  const message = args.filter((arg) => !arg.startsWith("--")).join(" ").trim();

  requireTool("gh", "Install the GitHub CLI and run: gh auth login");
  const repo = getRepo();
  const main = repo.defaultBranch;
  let branch = currentBranch();
  run("git", ["fetch", "--quiet", "origin"]);

  const changes = uncommittedChanges();
  const unpushed = unpushedCommits(main);
  const existingPr = branch === main ? undefined : findPullRequest(branch);

  if (!changes && unpushed === 0) {
    if (!existingPr) {
      console.log("Nothing to ship: there are no changes. Edit some code first.");
      return;
    }
    console.log(`==> No new changes. Pull request #${existingPr.number} is already up to date: ${existingPr.url}`);
  } else {
    if (changes && !message) {
      throw new Error('Describe your change in a few words, e.g.  pnpm ship "Add a products page"');
    }

    // ---- Safety checks before anything is sent ----
    const changedFiles = [
      ...run("git", ["diff", "--name-only", `origin/${main}...HEAD`]).split("\n"),
      ...pathsFromPorcelain(changes),
    ].filter(Boolean);
    if (missingMigration(changedFiles)) {
      throw new Error(
        "You changed the database tables (src/db/schema) but there is no migration for it.\n" +
          "  Run:  pnpm db:generate --name describe_the_change\n" +
          "  then restart pnpm dev to try it, and run pnpm ship again.",
      );
    }

    console.log("==> Checking your code, the same way GitHub will (lint, typecheck, tests, build)");
    for (const check of CHECKS) {
      console.log(`\n--- pnpm ${check} ---`);
      try {
        runVisible("pnpm", [check]);
      } catch {
        throw new Error(
          `"pnpm ${check}" failed (see above). Nothing was sent.\n` +
            `  Fix it, or ask Claude: "pnpm ship failed at ${check}, please fix it". Then run pnpm ship again.`,
        );
      }
    }

    // ---- Never work directly on the main branch ----
    if (branch === main) {
      const description = message || run("git", ["log", "-1", "--format=%s"]);
      const taken = run("git", ["branch", "-a", "--format=%(refname:short)"])
        .split("\n")
        .map((name) => name.replace(/^origin\//, ""));
      branch = branchNameFromMessage(description, taken);
      run("git", ["switch", "-c", branch]);
      // Commits made on the main branch now live on the new branch; put the main branch back.
      if (unpushed > 0) run("git", ["branch", "-f", main, `origin/${main}`]);
      console.log(`\n==> Your work is on a new branch: ${branch} (${main} stays as it is on GitHub)`);
    }

    if (changes) {
      run("git", ["add", "-A", "--", ".", IGNORED_PATHSPEC]);
      run("git", ["commit", "--quiet", "-m", message]);
    }
    await givePreviewsTestKeys(repo);
    console.log("==> Sending to GitHub");
    run("git", ["push", "--quiet", "-u", "origin", branch]);
  }

  let pr = findPullRequest(branch);
  if (!pr) {
    const title = message || run("git", ["log", "-1", "--format=%s"]);
    run("gh", [
      "pr", "create", "--base", main, "--head", branch, "--title", title,
      "--body", "Sent with `pnpm ship`. Merge with `pnpm release` once the checks are green.",
    ]);
    // GitHub can take a moment to list a brand-new pull request.
    for (let attempt = 0; attempt < 10 && !pr; attempt++) {
      await sleep(1000);
      pr = findPullRequest(branch);
    }
    if (!pr) throw new Error("The pull request was created but could not be found. Run pnpm status.");
    console.log(`==> Opened pull request #${pr.number}: ${pr.url}`);
  } else {
    console.log(`==> Updated pull request #${pr.number}: ${pr.url}`);
  }

  if (!wait) {
    console.log("\nDone. Run pnpm status to see the checks and preview, then pnpm release to put it live.");
    return;
  }

  // ---- Wait for GitHub's checks ----
  console.log("\n==> Waiting for GitHub's checks (Ctrl+C is safe: your work is already sent)");
  const checks = await waitForChecks(pr.number);
  if (checks.state === "failed") {
    console.log(`\n!! Checks failed on GitHub: ${checks.failed.join(", ")}
   Open ${pr.url}/checks to see why, or ask Claude: "the checks failed on PR #${pr.number}, please fix".
   After fixing, run pnpm ship again.`);
    process.exit(1);
  }
  console.log(checks.state === "passed" ? "    ✓ checks passed" : `    checks: ${checks.state} (see ${pr.url}/checks)`);

  // ---- Wait for the preview ----
  const coolify = connectToCoolifyIfSetUp();
  const app = await findCoolifyApp(coolify, repo).catch(() => undefined);
  const production = productionUrl(repo, app);
  if (!production) {
    console.log(`
==> Ready for review: ${pr.url}
    The app is not online yet, so there is no preview link. Try it on http://localhost:3000.
    When you are happy:  pnpm release`);
    return;
  }

  const preview = previewUrl(production, pr.number);
  console.log(`\n==> Waiting for the preview at ${preview} (building takes 3-5 minutes)`);
  let ready = false;
  if (coolify && app) {
    const result = await waitForDeployment(coolify, app.uuid, run("git", ["rev-parse", "HEAD"]), pr.number);
    if (result.outcome === "failed") {
      console.log(`!! The preview did not build or start. Log: ${result.link ?? "Coolify → your app → Deployments"}
   Ask Claude: "the preview of PR #${pr.number} failed, please check".`);
      process.exit(1);
    }
    ready = result.outcome === "done";
  } else {
    // Without a Coolify token we can only see whether the preview answers.
    for (let attempt = 0; attempt < 60 && !ready; attempt++) {
      ready = await isHealthy(preview);
      if (!ready) await sleep(10_000);
    }
  }

  console.log(
    ready
      ? `
==> ✓ Preview ready: ${preview}
    Try your change there (it uses test data, never your real users' data).
    When you are happy:  pnpm release`
      : `
==> The preview is not ready yet. Its link will appear on the pull request: ${pr.url}
    When you are happy:  pnpm release`,
  );
}

main().catch((error: unknown) => {
  console.error(`\n[ship] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
