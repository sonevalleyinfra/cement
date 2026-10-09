/**
 * Brings the latest App Factory kit (scripts, workflows, Dockerfile, guide) into an app,
 * as a pull request you can try and release like any other change.
 *
 *   Inside an app:            pnpm kit-update          (gets the kit from the template on GitHub)
 *   Inside app-factory:       pnpm kit-update ../my-shop   (uses this folder's kit; for apps made
 *                                                           before this command existed)
 *
 * Only kit files are replaced (see scripts/lib/kit-files.ts). Your app code is never touched.
 */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setUpGithubRepo } from "./lib/github-setup";
import { isKitFile, mergeKitScripts } from "./lib/kit-files";
import { getRepo, uncommittedChanges } from "./lib/project";
import { requireTool, run, runVisible } from "./lib/shell";

type RepoTemplateInfo = { isTemplate: boolean; templateRepository: { name: string; owner: { login: string } } | null };

function main() {
  requireTool("gh", "Install the GitHub CLI and run: gh auth login");
  const targetArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  const here = JSON.parse(run("gh", ["repo", "view", "--json", "isTemplate,templateRepository"])) as RepoTemplateInfo;

  let source: string;
  let target: string;
  let cleanUp = () => {};
  if (here.isTemplate) {
    if (!targetArg) throw new Error("This is the kit itself. To update an app from here:  pnpm kit-update ../my-shop");
    source = process.cwd();
    target = path.resolve(targetArg);
  } else {
    if (!here.templateRepository) throw new Error("This project was not made from the App Factory template.");
    const template = `${here.templateRepository.owner.login}/${here.templateRepository.name}`;
    target = process.cwd();
    source = mkdtempSync(path.join(tmpdir(), "app-factory-kit-"));
    cleanUp = () => rmSync(source, { recursive: true, force: true });
    console.log(`==> Getting the latest kit from ${template}`);
    run("gh", ["repo", "clone", template, source, "--", "--depth", "1", "--quiet"]);
  }

  try {
    const repo = getRepo(target);
    if (uncommittedChanges(target)) {
      throw new Error(`${target} has changes that are not sent yet. Ship or undo them first, then try again.`);
    }
    run("git", ["switch", "--quiet", repo.defaultBranch], { cwd: target });
    run("git", ["pull", "--quiet", "--ff-only"], { cwd: target });
    // Apps made before these settings existed get them now (security alerts, weekly update PRs).
    setUpGithubRepo(repo.nameWithOwner);

    // Copy the kit files.
    const files = run("git", ["ls-files"], { cwd: source }).split("\n").filter(isKitFile);
    for (const file of files) {
      mkdirSync(path.dirname(path.join(target, file)), { recursive: true });
      copyFileSync(path.join(source, file), path.join(target, file));
    }

    // Take the kit's package.json scripts; keep the app's own ones.
    const appPackagePath = path.join(target, "package.json");
    const appPackage = JSON.parse(readFileSync(appPackagePath, "utf8")) as { scripts: Record<string, string> };
    const templatePackage = JSON.parse(readFileSync(path.join(source, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const merged = mergeKitScripts(appPackage.scripts, templatePackage.scripts);
    if (merged.changed.length) {
      writeFileSync(appPackagePath, `${JSON.stringify({ ...appPackage, scripts: merged.scripts }, null, 2)}\n`);
    }

    const changed = uncommittedChanges(target);
    if (!changed) {
      console.log(`==> ${repo.name} already has the latest kit.`);
      return;
    }
    console.log(`==> Updated kit files in ${repo.name}:\n${changed}\n`);
    console.log("==> Sending it as a pull request (pnpm ship)");
    runVisible("pnpm", ["ship", "Update the App Factory kit"], { cwd: target });
  } finally {
    cleanUp();
  }
}

try {
  main();
} catch (error) {
  console.error(`\n[kit-update] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
