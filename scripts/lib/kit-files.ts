/**
 * Which files belong to the App Factory kit (and are refreshed by `pnpm kit-update`),
 * as opposed to your app's own code. No files, no network: easy to test.
 *
 * Kit files are overwritten by the template's version, so don't customise them in an app.
 * Your app code (src/, drizzle/, README.md, CLAUDE.md, .env*) is never touched.
 * Slash commands in .claude/skills/ are kit files too (add your own under a different name).
 */

const KIT_FOLDERS = ["scripts/", ".github/", ".claude/skills/"];
const KIT_FILES = new Set([
  "docs/GUIDE.md",
  "docs/OPERATIONS.md",
  "Dockerfile",
  "docker-entrypoint.sh",
  "docker-compose.dev.yml",
  ".dockerignore",
]);

export function isKitFile(file: string): boolean {
  return KIT_FILES.has(file) || KIT_FOLDERS.some((folder) => file.startsWith(folder));
}

/** package.json scripts owned by the kit. Other scripts (your own) are kept as they are. */
export const KIT_SCRIPTS = [
  "dev",
  "db:up",
  "db:migrate",
  "db:seed",
  "build:scripts",
  "new-app",
  "launch",
  "ship",
  "release",
  "status",
  "checkup",
  "update-deps",
  "kit-update",
  "keys",
  "backup",
];

/** The app's package.json scripts with the kit's scripts taken from the template. */
export function mergeKitScripts(
  app: Record<string, string>,
  template: Record<string, string>,
): { scripts: Record<string, string>; changed: string[] } {
  const scripts = { ...app };
  const changed: string[] = [];
  for (const name of KIT_SCRIPTS) {
    const value = template[name];
    if (value !== undefined && scripts[name] !== value) {
      scripts[name] = value;
      changed.push(name);
    }
  }
  return { scripts, changed };
}
