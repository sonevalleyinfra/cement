import { describe, expect, it } from "vitest";
import {
  backupProblem,
  branchNameFromMessage,
  deploymentOutcome,
  findDeployment,
  firstUrl,
  missingMigration,
  nextStep,
  pathsFromPorcelain,
  previewUrl,
  summarizeChecks,
  type ProjectState,
} from "./workflow-rules";

describe("branchNameFromMessage", () => {
  it("turns a description into a lowercase hyphenated name", () => {
    expect(branchNameFromMessage("Add products page!", [])).toBe("add-products-page");
    expect(branchNameFromMessage("  Fix: ₹ rounding in cart  ", [])).toBe("fix-rounding-in-cart");
  });

  it("falls back to 'change' when nothing usable is left", () => {
    expect(branchNameFromMessage("!!!", [])).toBe("change");
  });

  it("keeps names short without cutting a word in half", () => {
    const name = branchNameFromMessage("Add a very long description of a change that goes on and on", []);
    expect(name.length).toBeLessThanOrEqual(40);
    expect(name).toBe("add-a-very-long-description-of-a-change");
  });

  it("adds a number when the name is taken", () => {
    expect(branchNameFromMessage("Add products", ["add-products"])).toBe("add-products-2");
    expect(branchNameFromMessage("Add products", ["add-products", "add-products-2"])).toBe("add-products-3");
  });
});

describe("summarizeChecks", () => {
  const run = (status: string, conclusion: string | null = null) => ({ __typename: "CheckRun", name: "check", status, conclusion });

  it("is 'none' when nothing has started", () => {
    expect(summarizeChecks([]).state).toBe("none");
  });

  it("passes when every check succeeded or was skipped", () => {
    expect(summarizeChecks([run("COMPLETED", "SUCCESS"), run("COMPLETED", "SKIPPED")]).state).toBe("passed");
    expect(summarizeChecks([{ __typename: "StatusContext", context: "ci", state: "SUCCESS" }]).state).toBe("passed");
  });

  it("is pending while something still runs", () => {
    expect(summarizeChecks([run("COMPLETED", "SUCCESS"), run("IN_PROGRESS")]).state).toBe("pending");
    expect(summarizeChecks([{ context: "ci", state: "PENDING" }]).state).toBe("pending");
  });

  it("fails as soon as one check failed, even if others still run, and names it", () => {
    const result = summarizeChecks([
      { __typename: "CheckRun", name: "check", status: "COMPLETED", conclusion: "FAILURE" },
      run("QUEUED"),
    ]);
    expect(result).toEqual({ state: "failed", failed: ["check"] });
    expect(summarizeChecks([run("COMPLETED", "CANCELLED")]).state).toBe("failed");
    expect(summarizeChecks([{ context: "ci", state: "ERROR" }]).state).toBe("failed");
  });
});

describe("missingMigration", () => {
  it("is true when tables changed without a new migration", () => {
    expect(missingMigration(["src/db/schema/products.ts", "src/app/page.tsx"])).toBe(true);
  });

  it("is false when a migration was added too", () => {
    expect(missingMigration(["src/db/schema/products.ts", "drizzle/0001_add_products.sql"])).toBe(false);
  });

  it("ignores other files and schema tests", () => {
    expect(missingMigration(["src/app/page.tsx"])).toBe(false);
    expect(missingMigration(["src/db/schema/rules.test.ts"])).toBe(false);
  });
});

describe("pathsFromPorcelain", () => {
  it("reads changed, new and renamed files", () => {
    expect(pathsFromPorcelain(" M src/a.ts\n?? drizzle/0001_x.sql\nR  old.ts -> new.ts\n")).toEqual([
      "src/a.ts",
      "drizzle/0001_x.sql",
      "new.ts",
    ]);
    expect(pathsFromPorcelain("")).toEqual([]);
  });
});

describe("previewUrl / firstUrl", () => {
  it("puts the PR number in front of the production host", () => {
    expect(previewUrl("https://my-shop.buildcity.cloud", 7)).toBe("https://7.my-shop.buildcity.cloud");
  });

  it("takes the first of Coolify's comma-separated domains", () => {
    expect(firstUrl("https://a.example.com,https://b.example.com")).toBe("https://a.example.com");
    expect(firstUrl("a.example.com")).toBe("https://a.example.com");
    expect(firstUrl("")).toBeUndefined();
    expect(firstUrl(null)).toBeUndefined();
  });
});

describe("findDeployment / deploymentOutcome", () => {
  const deployments = [
    { commit: "bbb", pull_request_id: 3, status: "in_progress" },
    { commit: "aaa", pull_request_id: 0, status: "finished" },
    { commit: "aaa", pull_request_id: 3, status: "failed" },
  ];

  it("matches the commit and production (0) or the PR number", () => {
    expect(findDeployment(deployments, "aaa", 0)?.status).toBe("finished");
    expect(findDeployment(deployments, "aaa", 3)?.status).toBe("failed");
    expect(findDeployment(deployments, "ccc", 0)).toBeUndefined();
  });

  it("treats a missing PR id as production", () => {
    expect(findDeployment([{ commit: "aaa", status: "queued" }], "aaa", 0)?.status).toBe("queued");
  });

  it("maps Coolify statuses", () => {
    expect(deploymentOutcome("queued")).toBe("waiting");
    expect(deploymentOutcome("in_progress")).toBe("waiting");
    expect(deploymentOutcome("finished")).toBe("done");
    expect(deploymentOutcome("failed")).toBe("failed");
    expect(deploymentOutcome("cancelled-by-user")).toBe("failed");
  });
});

describe("backupProblem", () => {
  const now = new Date("2026-10-08T06:00:00Z");

  it("is fine when last night's backup succeeded", () => {
    expect(backupProblem([{ status: "success", created_at: "2026-10-07T21:30:03Z" }], true, now)).toBeNull();
  });

  it("reports no backups, failures, failed off-site copies and old backups", () => {
    expect(backupProblem([], true, now)).toMatch(/no backup/);
    expect(backupProblem([{ status: "failed", message: "disk full" }], true, now)).toMatch(/disk full/);
    expect(
      backupProblem([{ status: "success", message: "Warning: S3 upload failed", created_at: "2026-10-07T21:30:03Z" }], true, now),
    ).toMatch(/off-site/);
    expect(backupProblem([{ status: "success", created_at: "2026-10-05T21:30:03Z" }], true, now)).toMatch(/56 hours old/);
  });
});

describe("nextStep", () => {
  const base: ProjectState = { onDefaultBranch: true, uncommittedFiles: 0, unpushedCommits: 0, launched: true, productionHealthy: true };

  it("puts production being down first", () => {
    expect(nextStep({ ...base, productionHealthy: false, uncommittedFiles: 3 })).toMatch(/not answering/);
  });

  it("asks to ship unsent work", () => {
    expect(nextStep({ ...base, uncommittedFiles: 2 })).toMatch(/pnpm ship/);
    expect(nextStep({ ...base, unpushedCommits: 1 })).toMatch(/pnpm ship/);
  });

  it("follows the pull request's checks", () => {
    expect(nextStep({ ...base, pullRequest: { number: 4, checks: "failed" } })).toMatch(/failed on PR #4/);
    expect(nextStep({ ...base, pullRequest: { number: 4, checks: "pending" } })).toMatch(/still running/);
    expect(nextStep({ ...base, pullRequest: { number: 4, checks: "passed" } })).toMatch(/preview.*pnpm release/);
  });

  it("suggests launching when not online", () => {
    expect(nextStep({ ...base, launched: false, productionHealthy: undefined })).toMatch(/pnpm launch/);
  });

  it("says all good otherwise", () => {
    expect(nextStep(base)).toMatch(/All good/);
  });
});
