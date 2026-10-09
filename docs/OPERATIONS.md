# Operations notes for AI assistants

Read with `CLAUDE.md`. User-facing steps live in `docs/GUIDE.md`. Keep it in sync when you change a command or flow.
Everything below was verified live against **Coolify 4.3.23** (Oct 2026). Re-check if Coolify is upgraded.

## The owner's commands (use them; don't redo their steps by hand)

| The owner says... | Run | Notes |
| --- | --- | --- |
| "ship it", "send this", "open a PR" | `pnpm ship "<short description>"` | Runs lint/typecheck/test/build, branches off the default branch if needed, commits, pushes, opens/updates the PR, waits for checks + preview. Add the commit trailer to the message if you are the author. `--no-wait` to return early. |
| "make it live", "merge it", "release" | `pnpm release [n]` | **Only when the owner asks.** Refuses red, pending or conflicting PRs; squash-merges; waits for the production deploy (needs the Coolify token for that part). |
| "is everything OK?", "what's next?" | `pnpm status` | Read-only. Production health, last deploy, DB, last backup (`backupProblem`), open PRs, unsent work, next step. |
| "add a key", "which keys are missing?" | `pnpm keys` | Read-only status. Adding keys is the owner's job, in their own terminal (`pnpm keys set NAME --test\|--live`, hidden input) or editor. `pnpm keys push` syncs to Coolify. |
| "back up now" | `pnpm backup` | Runs and checks a backup of `<repo>-db` (incl. S3 warning). |
| "something's broken on my computer" | `pnpm checkup` | Read-only. (`pnpm doctor` is a pnpm built-in, hence the name.) |
| "update the tools in this app" | `pnpm kit-update` (in the app) / `pnpm kit-update ../app` (in the template) | Copies kit files (`scripts/lib/kit-files.ts`) and kit `package.json` scripts, then runs `pnpm ship`. Never touches `src/`, `drizzle/`, README, CLAUDE.md. |

Every activity is also a slash command in `.claude/skills/` (kit files, refreshed by kit-update). `/health` = status and
`/major-upgrade` because `/status` and `/upgrade` are Claude Code built-ins. Side-effect commands have
`disable-model-invocation: true`. Typing `/release` counts as the owner asking to merge that PR.

Key flow: `dev` fills `.env` with test keys (never live), `ship` pushes test keys to the preview set, `release` and
`launch` push live keys to production and refuse when a required one is missing or `keyKind` says test-in-prod /
live-in-preview. Pushes always write previews first (empty placeholders for live-only keys) because of trap 4.
Coolify bulk env PATCH upserts by key per set (checked in v4.3.23 source); `GET /applications/{uuid}/envs` returns key
names and flags without values for the normal token.

Rules live in plain functions with tests: `scripts/lib/workflow-rules.ts`, `local-env.ts`,
`dependency-updates.ts`, `kit-files.ts`, `launch-plan.ts`, `vault.ts`. Before checking pnpm command names: pnpm built-ins
(`doctor`, `setup`, `deploy`, `publish`, ...) win over package.json scripts.

## How it fits together

- **Local:** `pnpm dev` (`scripts/dev.ts`) = make `.env` if missing → check Docker → if `LOCAL_DB_PORT` is
  taken (by the OS **or** by another container's published port: Docker 29 holds ports without a normal
  listening socket, so check `docker ps` too) move to a free port in `.env` → `docker-compose.dev.yml`
  Postgres + migrate + seed + `next dev`.
- **`pnpm new-app <name>`** (`scripts/new-app.ts`): GitHub repo from the template, clone to `../<name>`, `.env` with fresh secret and free port, then `pnpm dev`.
- **`pnpm launch`** (`scripts/launch.ts`, rules in `scripts/lib/launch-plan.ts`): once per project, via the Coolify REST API.
  Creates the project, prod Postgres (nightly backup 03:00 IST, to S3/R2), preview Postgres, Dockerfile app on the
  default branch at `https://<repo>.<wildcard>`, PR previews on, env vars, deploy, then: sets the GitHub repo
  homepage to the prod URL (ship/release/status read it when there is no Coolify token), turns on security alerts
  and "Actions may create PRs", emails the admin a password-reset link (`POST /api/auth/request-password-reset`),
  then a test backup.
- **After launch:** push to the default branch deploys prod; a PR gets a preview at `https://<pr>.<repo>.<wildcard>`
  (Coolify comments the link). GitHub Actions (`.github/workflows/ci.yml`) runs lint/typecheck/test/build.
  The free GitHub plan cannot block merging a red PR: `pnpm release` enforces it, so use it instead of `gh pr merge`.
- **Weekly:** `.github/workflows/weekly-updates.yml` (Mon 03:30 UTC) runs `pnpm update-deps` (in-range updates +
  exact pins to the newest same-major version at least 24 h old, because pnpm 11's `minimumReleaseAge` refuses
  newer ones) and opens/updates the `weekly-updates` PR. PRs made with `GITHUB_TOKEN` don't trigger other
  workflows, so it starts `ci.yml` with `gh workflow run` (hence `workflow_dispatch` in ci.yml). Needs the repo
  setting "Allow GitHub Actions to create and approve pull requests" (set by new-app, launch and kit-update).
  Dependabot is not used: with pnpm 11 its lockfiles fail `minimumReleaseAge` in CI.

## Credentials: never read or print them

- `~/.config/coolify/`: `coolify_url.txt`, `coolify_token.txt` (secret), `resend_api_key.txt` (secret), `email_domain.txt`.
  Check secrets only with `ls -l`/`stat` or `pnpm checkup`. Scripts read them; you never cat or echo them.
- `~/.config/app-factory/` is the **key safe** (`test.env`, `prod.env`, `test/`, `prod/`): integration keys shared by all
  apps. Secret: never read, cat, grep or print it, never ask for values. Use `pnpm keys` (names and ✓/✗ only).
  Rules in `scripts/lib/vault.ts`; IO in `vault-store.ts`. Apps declare keys in `.env.example` (empty = required in prod).
- Never use a token or key pasted in chat. Ask the user to put it in the file themselves (`read -rs …`, in a real
  terminal: the `!` box cannot answer prompts).
- Never delete repos, Coolify resources, databases or backups. Tell the user what to delete. Merge PRs only when asked.

## Tools and their limits

- The Coolify MCP can read, `deploy` and `control` (start/stop/restart), but **cannot create** resources. Creation is
  done by `scripts/launch.ts` (REST API).
- Read-only REST calls that work with the normal token (verified): `GET /applications` (`git_repository`, `fqdn`,
  `status`), `GET /deployments/applications/{uuid}?skip=0&take=20` (`commit`, `pull_request_id` 0 = production,
  `status`, `deployment_url`), `GET /databases`, `GET /databases/{uuid}/backups` (includes `executions`, newest first).
- Without the `read:sensitive` token ability you **cannot** read build/deploy logs, env values, or DB internal URLs.
  To debug a failed deploy: check `list_deployments` status, reproduce locally (`docker build` + run with the same
  env), or ask the user to paste the log from the Coolify UI.

## Coolify 4.3.23 traps (all hit in practice)

1. `GET /version` returns **plain text**, not JSON.
2. Databases created with `instant_deploy: true` **did not start**. Call `POST /databases/{uuid}/start` and poll until `running`.
3. App health check must use **host `127.0.0.1`**. `localhost` resolves to `::1` first in `node:24-alpine` and the
   app listens on IPv4, so every deploy was marked unhealthy and stopped.
4. Creating a **production** env var auto-creates a **preview** copy (same value) unless a preview var with that key
   exists. Always write preview vars first, or previews get the prod `DATABASE_URL`.
5. Secrets must be `is_buildtime: false` (otherwise they become Docker build args).
6. The DB internal URL is hidden without `read:sensitive`. Build it: `postgres://user:pass@<db uuid>:5432/<db>`.
7. `COOLIFY_URL` is injected at runtime (prod and previews). `BETTER_AUTH_URL` is deliberately unset so each preview
   uses its own URL.
8. **Backups:** run now with `PATCH /databases/{uuid}/backups/{backup_uuid}` `{"backup_now":true}`. A failed S3 upload
   still records `status: "success"` with `Warning: S3 upload failed` in `message` and sends **no alert**. Use `checkBackup()`.
9. **Restore:** no API in 4.3.23, so it's UI only (database → Import Backup → S3). The default import command lacks
   `--clean`, so it does **not** replace data. Use
   `pg_restore -U $POSTGRES_USER -d ${POSTGRES_DB:-${POSTGRES_USER:-postgres}} --clean --if-exists`.
   The final "Import finished with exit code 0" is always 0. Check for `pg_restore: error` lines instead.
   Stop the app before restoring and start it after. Procedure: `docs/GUIDE.md` section 9.
10. Wildcard DNS resolves multi-level names, so preview URLs `{{pr_id}}.{{domain}}` work.

## Email

- The template requires email verification, so production needs `EMAIL_MODE=live` + `RESEND_API_KEY`, or nobody can sign in.
- `EMAIL_FROM` must use the **Resend-verified domain** (`email_domain.txt`), which may be a subdomain such as
  `mail.example.com`, not the app's domain. Previews use `allowlist` (admin only).
