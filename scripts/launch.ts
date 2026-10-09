/**
 * pnpm launch [--admin-email you@example.com]
 *
 * Puts this project online with Coolify, once. Creates:
 *   - a Coolify project named after the GitHub repo,
 *   - a production Postgres database with a nightly backup (to S3/R2 if Coolify has one),
 *   - a separate Postgres database for pull request previews,
 *   - the app, linked to the repo's default branch, at https://<repo>.<server wildcard domain>,
 *     with preview deployments switched on,
 * then deploys, waits until the app is healthy, emails the admin a link to set their password,
 * saves the address on the GitHub repo, and tests a backup.
 *
 * After that it is automatic: `pnpm ship` → pull request with its own preview link;
 * `pnpm release` → merged and deployed to production.
 *
 * Settings come from ~/.config/coolify/ (see scripts/lib/coolify-api.ts).
 */
import {
  appDomain,
  buildAppEnvVars,
  dailyCronAtIST,
  pickAdminEmail,
  pickEmailDomain,
  postgresUrl,
  randomSecret,
  toCoolifyEnvVars,
  validateAppName,
} from "./lib/launch-plan";
import { runBackupNow } from "./lib/backups";
import { connectToCoolify, readOptionalConfigFile } from "./lib/coolify-api";
import { setRepoHomepage, setUpGithubRepo } from "./lib/github-setup";
import { requireTool, run, sleep } from "./lib/shell";
import { explainKeyProblems, planServerKeys } from "./lib/vault";
import { appDeclaredKeys, loadVault } from "./lib/vault-store";

type Server = { uuid: string; name: string; is_usable?: boolean; settings?: { wildcard_domain?: string | null } };
type GithubApp = { uuid: string; name: string; is_public: boolean };
type S3Storage = { uuid: string; name: string; is_usable: boolean };
type Deployment = { status: string };
type Database = { status?: string };

const POSTGRES_IMAGE = "postgres:18-alpine"; // same as docker-compose.dev.yml
const DATABASE_NAME = "app";
const DATABASE_USER = "app";

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

/**
 * Starts a database and waits until Coolify reports it running.
 * (Creating it with instant_deploy did not reliably start it on Coolify 4.3.23.)
 */
async function startDatabase(coolify: ReturnType<typeof connectToCoolify>, uuid: string, label: string) {
  await coolify.request("POST", `/databases/${uuid}/start`);
  for (let attempt = 0; attempt < 36; attempt++) {
    const { status } = await coolify.request<Database>("GET", `/databases/${uuid}`);
    if (status?.startsWith("running")) {
      console.log(`    ${label}: ${status}`);
      return;
    }
    await sleep(5000);
  }
  throw new Error(`The ${label} did not start within 3 minutes. Check its logs in Coolify.`);
}

/**
 * Emails the admin a link to choose their password (the app's normal "forgot password" email),
 * so nobody has to copy the generated password out of Coolify.
 */
async function emailAdminPasswordLink(appUrl: string, email: string): Promise<boolean> {
  try {
    const response = await fetch(`${appUrl}/api/auth/request-password-reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: appUrl },
      body: JSON.stringify({ email, redirectTo: "/reset-password" }),
      signal: AbortSignal.timeout(15_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function main() {
  requireTool("gh", "Install the GitHub CLI and run: gh auth login");
  const coolify = connectToCoolify();

  // ---- What are we launching? ----
  const repo = JSON.parse(run("gh", ["repo", "view", "--json", "name,nameWithOwner,defaultBranchRef"])) as {
    name: string;
    nameWithOwner: string;
    defaultBranchRef: { name: string };
  };
  const name = repo.name;
  const branch = repo.defaultBranchRef.name;
  const nameError = validateAppName(name);
  if (nameError) throw new Error(`The repo name is used as the app name. ${nameError}`);

  let gitEmail = "";
  try {
    gitEmail = run("git", ["config", "user.email"]);
  } catch {
    // Not set: pickAdminEmail explains what to do.
  }
  const admin = pickAdminEmail(readFlag("admin-email"), gitEmail);
  if ("error" in admin) throw new Error(admin.error);
  const adminEmail = admin.email;

  try {
    run("git", ["fetch", "--quiet", "origin", branch]);
    const unpushed = Number(run("git", ["rev-list", "--count", `origin/${branch}..${branch}`]));
    if (unpushed > 0) {
      console.warn(`!! ${unpushed} commit(s) on ${branch} are not on GitHub yet. Coolify deploys what is on GitHub.`);
    }
  } catch {
    // No local copy of the branch: nothing to compare.
  }

  // ---- Check Coolify before creating anything ----
  const version = await coolify.request<string>("GET", "/version");
  console.log(`==> Coolify ${version} at ${coolify.baseUrl}`);

  const servers = (await coolify.request<Server[]>("GET", "/servers")).filter((s) => s.is_usable !== false);
  const serverName = readFlag("server");
  const server = serverName ? servers.find((s) => s.name === serverName) : servers.length === 1 ? servers[0] : undefined;
  if (!server) {
    throw new Error(`Choose a server with --server <name>. Available: ${servers.map((s) => s.name).join(", ") || "none"}`);
  }

  const githubApps = (await coolify.request<GithubApp[]>("GET", "/github-apps")).filter((a) => !a.is_public);
  const owner = repo.nameWithOwner.split("/")[0];
  const githubApp = githubApps.length === 1 ? githubApps[0] : githubApps.find((a) => a.name === owner);
  if (!githubApp) {
    throw new Error("Connect GitHub in Coolify first: Sources → + Add → GitHub App, and give it access to this repo.");
  }

  const projects = await coolify.request<{ uuid: string; name: string }[]>("GET", "/projects");
  if (projects.some((p) => p.name === name)) {
    throw new Error(`Coolify already has a project called "${name}". It is probably launched already.`);
  }

  const s3 = (await coolify.request<S3Storage[]>("GET", "/s3-storages")).find((s) => s.is_usable);
  const resendApiKey = readOptionalConfigFile("resend_api_key.txt");
  if (!resendApiKey) {
    console.warn(
      "!! No ~/.config/coolify/resend_api_key.txt: the app will not send email, so new users cannot verify\n" +
        "   their email and sign in. You can add RESEND_API_KEY in Coolify later (see README).",
    );
  }
  // Keys the app needs (from .env.example): test keys for previews, live keys for production.
  const keyPlan = planServerKeys(appDeclaredKeys(), loadVault("test"), loadVault("live"), {
    production: new Set(),
    preview: new Set(),
  });
  const keyProblems = explainKeyProblems(keyPlan);
  if (keyProblems) throw new Error(`Nothing was created: production keys aren't ready.\n${keyProblems}`);
  if (keyPlan.missingPreview.length) {
    console.warn(`!! Previews won't have these keys (no test key in your key safe): ${keyPlan.missingPreview.join(", ")}`);
  }

  const domain = appDomain(name, server.settings?.wildcard_domain);
  const emailDomain = pickEmailDomain(readOptionalConfigFile("email_domain.txt"), domain, name);

  console.log(`==> Launching ${repo.nameWithOwner} (branch ${branch}) on server "${server.name}"`);

  // ---- Create everything ----
  const project = await coolify.request<{ uuid: string }>("POST", "/projects", {
    name,
    description: `github.com/${repo.nameWithOwner}`,
  });
  const projectLink = `${coolify.baseUrl}/project/${project.uuid}`;
  const where = { server_uuid: server.uuid, project_uuid: project.uuid, environment_name: "production" };

  try {
    console.log("==> Creating the production database");
    const productionPassword = randomSecret(32);
    const productionDb = await coolify.request<{ uuid: string }>("POST", "/databases/postgresql", {
      ...where,
      name: `${name}-db`,
      description: "Production data. Backed up every night.",
      image: POSTGRES_IMAGE,
      postgres_user: DATABASE_USER,
      postgres_password: productionPassword,
      postgres_db: DATABASE_NAME,
    });

    console.log(`==> Scheduling nightly backups at 03:00 IST${s3 ? ` (kept on the server and in "${s3.name}")` : ""}`);
    const backup = await coolify.request<{ uuid: string }>("POST", `/databases/${productionDb.uuid}/backups`, {
      frequency: dailyCronAtIST(3, 0),
      enabled: true,
      databases_to_backup: DATABASE_NAME,
      database_backup_retention_amount_locally: 7,
      ...(s3 ? { save_s3: true, s3_storage_uuid: s3.uuid, database_backup_retention_days_s3: 30 } : {}),
    });

    console.log("==> Creating the preview database (for pull requests)");
    const previewPassword = randomSecret(32);
    const previewDb = await coolify.request<{ uuid: string }>("POST", "/databases/postgresql", {
      ...where,
      name: `${name}-preview-db`,
      description: "Shared by all pull request previews. Not backed up.",
      image: POSTGRES_IMAGE,
      postgres_user: DATABASE_USER,
      postgres_password: previewPassword,
      postgres_db: DATABASE_NAME,
    });

    console.log("==> Starting both databases");
    await startDatabase(coolify, productionDb.uuid, "production database");
    await startDatabase(coolify, previewDb.uuid, "preview database");

    console.log(`==> Creating the app${domain ? ` at ${domain}` : ""}`);
    const app = await coolify.request<{ uuid: string }>("POST", "/applications/private-github-app", {
      ...where,
      github_app_uuid: githubApp.uuid,
      git_repository: repo.nameWithOwner,
      git_branch: branch,
      build_pack: "dockerfile",
      ports_exposes: "3000",
      name,
      ...(domain ? { domains: domain } : { autogenerate_domain: true }),
      is_auto_deploy_enabled: true,
      is_preview_deployments_enabled: true,
      health_check_enabled: true,
      health_check_path: "/api/health",
      health_check_port: "3000",
      // Not "localhost": in the Alpine image that resolves to IPv6 (::1) first, and the app
      // listens on IPv4 only, so the check would always fail and Coolify would stop the app.
      health_check_host: "127.0.0.1",
      instant_deploy: false,
    });

    // The database host inside Coolify's Docker network is the database's uuid.
    const vars = buildAppEnvVars({
      appName: name,
      emailDomain,
      adminEmail,
      resendApiKey,
      productionDatabaseUrl: postgresUrl({
        user: DATABASE_USER,
        password: productionPassword,
        host: productionDb.uuid,
        database: DATABASE_NAME,
      }),
      previewDatabaseUrl: postgresUrl({
        user: DATABASE_USER,
        password: previewPassword,
        host: previewDb.uuid,
        database: DATABASE_NAME,
      }),
    });
    // The app's own keys (payments, video, Google sign-in...) from your key safe.
    vars.preview.push(...toCoolifyEnvVars(keyPlan.preview, true));
    vars.production.push(...toCoolifyEnvVars(keyPlan.production, false));

    // Order matters: Coolify copies every new production variable into the preview set
    // unless a preview variable with that name already exists. Saving previews first stops
    // the production database address from leaking into pull request previews.
    console.log("==> Saving environment variables (previews first, then production)");
    await coolify.request("PATCH", `/applications/${app.uuid}/envs/bulk`, { data: vars.preview });
    await coolify.request("PATCH", `/applications/${app.uuid}/envs/bulk`, { data: vars.production });

    console.log("==> Starting the first deployment (building takes a few minutes)");
    const deploy = await coolify.request<{ deployments: { deployment_uuid: string }[] }>(
      "POST",
      `/deploy?uuid=${app.uuid}`,
    );
    const deploymentUuid = deploy.deployments[0]?.deployment_uuid;

    // ---- Wait for it ----
    let status = "queued";
    if (deploymentUuid) {
      const deadline = Date.now() + 20 * 60_000;
      let last = "";
      while (Date.now() < deadline) {
        status = (await coolify.request<Deployment>("GET", `/deployments/${deploymentUuid}`)).status;
        if (status !== last) console.log(`    deployment: ${status}`);
        last = status;
        if (!["queued", "in_progress"].includes(status)) break;
        await sleep(10_000);
      }
    }

    if (status !== "finished") {
      console.log(`
!! The deployment did not finish (status: ${status}). Nothing else needs to be created.
   See the build log in Coolify: ${projectLink} → ${name} → Deployments
   After fixing the problem, push to ${branch} (or click Redeploy) and it deploys again.`);
      process.exit(1);
    }

    let healthy = false;
    if (domain) {
      for (let attempt = 0; attempt < 12 && !healthy; attempt++) {
        healthy = await fetch(`${domain}/api/health`).then((r) => r.ok, () => false);
        if (!healthy) await sleep(5000);
      }
    }

    // Lets ship / release / status find the app, and shows the address on GitHub.
    if (domain) setRepoHomepage(repo.nameWithOwner, domain);
    setUpGithubRepo(repo.nameWithOwner);

    const passwordEmailSent = Boolean(resendApiKey && healthy && domain) && (await emailAdminPasswordLink(domain!, adminEmail));

    console.log("==> Testing the backup (runs one now)");
    const backupCheck = await runBackupNow(coolify, productionDb.uuid, backup.uuid, Boolean(s3));
    console.log(backupCheck.ok ? "    backup: saved" : `!! backup problem: ${backupCheck.problem}`);

    console.log(`
==> Done! ${domain ?? "(see the domain in Coolify)"}${healthy ? " is up and healthy." : ""}

    Admin login: ${adminEmail}
    ${
      passwordEmailSent
        ? `Password: we emailed ${adminEmail} a link to choose it (check spam; the link works for 1 hour,\n              after that use "Forgot password" on the sign-in page).`
        : `Password: use "Forgot password" on ${domain ?? "the app"}/sign-in once email works,\n              or copy SEED_ADMIN_PASSWORD from Coolify → ${name} → Environment Variables.`
    }
    Coolify: ${projectLink}

    From now on:
      - ${'pnpm ship "what changed"'.padEnd(28)} → checks, pull request, and a preview link
      - ${"pnpm release".padEnd(28)} → merges it (only if checks are green) and waits until it is live
      - ${"pnpm status".padEnd(28)} → is everything OK? what next?
    Backups: every night at 03:00 IST${s3 ? `, copied to "${s3.name}"` : " (on the server only: add an S3 storage in Coolify for off-site copies)"}.
    ${
      resendApiKey
        ? `Email: on, from noreply@${emailDomain} (must be verified in Resend). Previews only email ${adminEmail}.`
        : "Email: OFF. Users cannot verify their email until you add RESEND_API_KEY and set EMAIL_MODE=live\n" +
          "    in Coolify → Environment Variables, then redeploy."
    }`);
  } catch (error) {
    console.error(`
!! Launch stopped half-way. Delete the half-made project in Coolify, fix the problem below, and run pnpm launch again:
   ${projectLink}  (delete the app and both databases in it, then the project)`);
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error(`\n[launch] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
