import { describe, expect, it } from "vitest";
import { isKitFile, mergeKitScripts } from "./kit-files";

describe("isKitFile", () => {
  it("includes the kit's scripts, workflows, Docker files and guides", () => {
    for (const file of ["scripts/ship.ts", "scripts/lib/project.ts", ".github/workflows/ci.yml", "Dockerfile", "docs/GUIDE.md", ".claude/skills/ship/SKILL.md"]) {
      expect(isKitFile(file)).toBe(true);
    }
  });

  it("never includes the app's own code, settings or docs", () => {
    for (const file of ["src/app/page.tsx", "drizzle/0000_init.sql", "README.md", "CLAUDE.md", ".env.example", "package.json", "docs/MY-NOTES.md", ".claude/settings.local.json", ".claude/worktrees/x/a.ts"]) {
      expect(isKitFile(file)).toBe(false);
    }
  });
});

describe("mergeKitScripts", () => {
  it("takes kit scripts from the template and keeps the app's own scripts", () => {
    const app = { dev: "old dev", launch: "tsx scripts/launch.ts", seed: "my own seed" };
    const template = { dev: "tsx scripts/dev.ts", launch: "tsx scripts/launch.ts", ship: "tsx scripts/ship.ts", build: "template build" };
    const result = mergeKitScripts(app, template);
    expect(result.scripts).toEqual({
      dev: "tsx scripts/dev.ts",
      launch: "tsx scripts/launch.ts",
      seed: "my own seed",
      ship: "tsx scripts/ship.ts",
    });
    expect(result.changed).toEqual(["dev", "ship"]);
  });
});
