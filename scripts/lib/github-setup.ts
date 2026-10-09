/**
 * One-time GitHub settings for a project, used by `pnpm new-app` and `pnpm launch`.
 * Each step is optional: if one fails it is reported and the rest carries on.
 */
import { run } from "./shell";

function attempt(label: string, args: string[]) {
  try {
    run("gh", args);
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
    console.warn(`!! Could not ${label} (${reason}). Not needed to continue.`);
  }
}

/** Security alerts by email, and permission for the weekly-updates workflow to open pull requests. */
export function setUpGithubRepo(repo: string) {
  attempt("turn on security alerts", ["api", "--silent", "-X", "PUT", `repos/${repo}/vulnerability-alerts`]);
  attempt("let the weekly update job open pull requests", [
    "api", "--silent", "-X", "PUT", `repos/${repo}/actions/permissions/workflow`,
    "-f", "default_workflow_permissions=read",
    "-F", "can_approve_pull_request_reviews=true",
  ]);
}

/** Shows the production address on the repo's GitHub page. ship/release/status also read it from there. */
export function setRepoHomepage(repo: string, url: string) {
  attempt("save the web address on GitHub", ["repo", "edit", repo, "--homepage", url]);
}
