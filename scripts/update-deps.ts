/**
 * pnpm update-deps [--summary file.md]
 *
 * Safe package updates: bug fixes and features within the same major version, only for
 * versions released at least a day ago. Run every Monday by .github/workflows/weekly-updates.yml,
 * which opens a pull request with the result. Bigger (breaking) upgrades are only listed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { describeChanges, isExactPin, pickBigUpgrade, pickSafeUpdate } from "./lib/dependency-updates";
import { run, runVisible } from "./lib/shell";

type PackageJson = { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

const readPackage = () => JSON.parse(readFileSync("package.json", "utf8")) as PackageJson;
const allDeps = (pkg: PackageJson) => ({ ...pkg.dependencies, ...pkg.devDependencies });

function publishTimes(name: string): Record<string, string> {
  try {
    return JSON.parse(run("pnpm", ["view", name, "time", "--json"])) as Record<string, string>;
  } catch {
    console.warn(`!! Could not look up ${name}; skipping it.`);
    return {};
  }
}

function main() {
  const summaryIndex = process.argv.indexOf("--summary");
  const summaryFile = summaryIndex === -1 ? undefined : process.argv[summaryIndex + 1];
  const now = new Date();
  const before = readPackage();

  // 1. Everything with a range (^1.2.3) moves to the newest version inside its range.
  console.log("==> Updating packages within their allowed ranges");
  runVisible("pnpm", ["update"]);

  // 2. Exactly pinned packages (e.g. next 16.3.8) move to the newest safe version.
  const pinned = readPackage();
  const times = new Map<string, Record<string, string>>();
  const targets = { prod: [] as string[], dev: [] as string[] };
  for (const [group, deps] of [["prod", pinned.dependencies], ["dev", pinned.devDependencies]] as const) {
    for (const [name, spec] of Object.entries(deps ?? {})) {
      if (!isExactPin(spec)) continue;
      times.set(name, publishTimes(name));
      const target = pickSafeUpdate(spec, times.get(name)!, now);
      if (target) targets[group].push(`${name}@${target}`);
    }
  }
  if (targets.prod.length) runVisible("pnpm", ["add", "--save-exact", ...targets.prod]);
  if (targets.dev.length) runVisible("pnpm", ["add", "--save-dev", "--save-exact", ...targets.dev]);

  // 3. Report.
  const after = allDeps(readPackage());
  const changes = describeChanges(allDeps(before), after);
  const big = Object.entries(after)
    .map(([name, spec]) => {
      const version = pickBigUpgrade(spec, times.get(name) ?? publishTimes(name), now);
      return version ? `${name}: ${spec} → ${version}` : null;
    })
    .filter(Boolean);

  const summary = [
    "Safe updates (same major version, released at least a day ago).",
    "GitHub runs the checks on this pull request, and Coolify builds a preview once the app is launched.",
    "If the checks are green and the preview works, put it live with `pnpm release <number>`.",
    "",
    "**Changed in package.json**",
    ...(changes.length ? changes.map((c) => `- ${c}`) : ["- none (only packages used by your packages changed)"]),
    ...(big.length
      ? ["", "**Bigger upgrades available (not included: they can break things)**", ...big.map((b) => `- ${b}`),
         "", 'Ask Claude when you have time: "upgrade <package> to the new major version".']
      : []),
  ].join("\n");
  console.log(`\n${summary}`);
  if (summaryFile) writeFileSync(summaryFile, `${summary}\n\n🤖 Opened by the weekly-updates workflow.\n`);
}

main();
