# App Factory

> **New here? Read the step-by-step [beginner's guide](docs/GUIDE.md)** (start a project, go online,
> previews, backups, restore, troubleshooting).

A starter template for Next.js apps deployed on your own server with [Coolify](https://coolify.io).

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · pnpm ·
Postgres + Drizzle ORM · Better Auth (email + password, email verification, password reset, admin role) ·
Resend for email · Vitest.

**India defaults:** `en-IN` locale, `₹` with lakh/crore grouping, dates in `Asia/Kolkata`, money stored as integer paise.

---

## The whole workflow in five commands

| You want to... | Run | What it does for you |
| --- | --- | --- |
| Start a new app | `pnpm new-app my-shop` (add `--launch` to put it online straight away) | GitHub repo, local copy, settings, database, dev server |
| Work on it | `pnpm dev` | Local database + app at http://localhost:3000. Fixes a missing `.env` and port clashes by itself. |
| Send a change for review | `pnpm ship "Add products page"` | Runs every check, makes a branch, commits, pushes, opens a pull request, waits for the preview link |
| Put it live | `pnpm release` | Merges **only if the checks are green**, then waits until production runs the new version |
| See if all is well | `pnpm status` | Production up? Backups OK? Pull requests? Unsent work? And what to do next |

Plus `pnpm launch` (once per app, puts it online), `pnpm checkup` (is this computer ready?),
`pnpm keys` (test and live keys for integrations, see [Keys](#keys-for-integrations-one-safe-for-all-apps)),
`pnpm backup` (back up production now) and `pnpm kit-update` (bring the latest version of these tools into an existing app).

**In Claude Code**, every activity is also a slash command: `/dev`, `/ship`, `/release`, `/health`, `/checkup`,
`/new-app`, `/launch`, `/keys`, `/integrate`, `/db-change`, `/fix-checks`, `/diagnose`, `/backup`, `/restore`,
`/rollback`, `/major-upgrade`, `/kit-update`. Type `/howto` for the list (they live in `.claude/skills/`).
**Maintenance runs by itself:** nightly backups, security alerts, and every Monday a pull request with
safe package updates (see [Automatic maintenance](#automatic-maintenance)).

---

## Start a new project (one command)

You need **Node.js 24+**, **pnpm** (`corepack enable`), **Docker** and the **GitHub CLI** (`gh auth login`).
From this template's folder:

```bash
pnpm new-app my-shop
```

This creates a private GitHub repo `my-shop` from this template (security alerts on), clones it next to
this folder (`../my-shop`), writes a `.env` with a fresh secret and its own local database port, installs
packages and starts the dev server at http://localhost:3000. Nothing goes online yet, unless you add `--launch`.

Next time, inside the project, just run:

```bash
pnpm dev
```

`pnpm dev` starts the local database (Docker), applies migrations, creates the admin account from
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, and starts the dev server. If there is no `.env` (e.g. a fresh
clone on a new computer) it makes one; if another project already uses the database port, it moves this
one to a free port; if Docker is off, it tells you how to start it.

Sign in as the admin (`sonevalleyinfra@gmail.com` / `123456` by default, local only) and open `/users`.
Change the password in More → **Change password**.

<details>
<summary>Running this template folder itself (without <code>new-app</code>)</summary>

```bash
pnpm install && pnpm dev
```
</details>

**Emails in development:** with `EMAIL_MODE=log` nothing is sent. Verification and password-reset
emails are printed in the terminal where `pnpm dev` runs, so you can copy the link from there.

---

## Keys for integrations: one safe for all apps

Test keys (Razorpay test mode, LiveKit, Google OAuth, Firebase, S3...) are the same for every app you build,
so you keep **one copy on your computer**, in `~/.config/app-factory/` (only you can read it, never in git):

| File | Holds | Used by |
| --- | --- | --- |
| `test.env` | test keys, e.g. `RAZORPAY_KEY_ID=rzp_test_...` | your computer (`pnpm dev`) and pull request previews (`pnpm ship`) |
| `prod.env` | live keys, e.g. `RAZORPAY_KEY_ID=rzp_live_...` | production only (`pnpm launch`, `pnpm release`) |
| `test/`, `prod/` | JSON files, e.g. `firebase-service-account.json` | become a variable named after the file: `FIREBASE_SERVICE_ACCOUNT_JSON` |

`pnpm keys` creates it with commented examples. Add keys with `pnpm keys set NAME --test` (or `--live`; typing is
hidden), `pnpm keys add-file path.json --test`, or by editing the files.

An app only gets the keys it lists in its `.env.example` (`/integrate razorpay` adds them). An empty value there
means **required in production**: `pnpm release` and `pnpm launch` refuse until production has it, and refuse a
test key (`rzp_test_`) in production or a live key (`rzp_live_`) in previews or on your computer.

---

## Environment variables

All of them are checked by [`src/env.ts`](src/env.ts) on start-up. If one is missing or wrong, the app
refuses to start and prints which one.

| Variable | Required | What it is for |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Postgres connection string, e.g. `postgres://user:pass@host:5432/db`. |
| `BETTER_AUTH_SECRET` | Yes | Secret that signs sessions and tokens. At least 32 characters. Generate with `openssl rand -base64 32`. Use a different one per environment and never commit it. |
| `BETTER_AUTH_URL` | No* | Public URL of the app, e.g. `https://myapp.example.com`. Used in email links and cookies. *If empty, `COOLIFY_URL` is used. Coolify sets that automatically on every deployment, including preview deployments. One of the two must exist. |
| `RESEND_API_KEY` | When `EMAIL_MODE` is `allowlist` or `live` | API key from [resend.com](https://resend.com/api-keys). |
| `EMAIL_FROM` | Yes | Sender of all emails, e.g. `My App <noreply@myapp.com>`. The domain must be verified in Resend. |
| `EMAIL_MODE` | Yes | `log` = print emails to the console, send nothing. `allowlist` = send only to `EMAIL_ALLOWLIST`. `live` = send to everyone. |
| `EMAIL_ALLOWLIST` | When `EMAIL_MODE=allowlist` | Comma-separated addresses allowed to receive email, e.g. `me@gmail.com,tester@gmail.com`. |
| `SEED_ADMIN_EMAIL` | Yes | Email of the first admin. Created on start-up if there is no admin yet. If the only admin is the old placeholder `admin@example.com`, it is replaced by this one. |
| `SEED_ADMIN_PASSWORD` | Yes | Password for that admin: 6+ characters locally, 12+ in production. Change it after the first sign-in (Dashboard → Change password). |
| `LOCAL_DB_PORT` | Local only | Port of the local Docker database (default `5433`). Read by `docker-compose.dev.yml`, not by the app. Must match the port in `DATABASE_URL`. |

Suggested `EMAIL_MODE`: `log` on your laptop, `allowlist` for preview/staging, `live` in production.

---

## Useful commands

| Command | What it does |
| --- | --- |
| `pnpm new-app <name> [--launch]` | Start a new project from this template (see above). |
| `pnpm dev` | Start the local database, migrate, seed the admin, start the dev server. |
| `pnpm ship "message"` | Check, commit, push and open/update a pull request; wait for checks and preview. `--no-wait` to skip waiting. |
| `pnpm release [number]` | Merge a green pull request and wait until it is live. Refuses red or conflicting ones. |
| `pnpm status` | One-screen overview and the next step. Read-only. |
| `pnpm checkup` | Check this computer is ready (Node, Docker, GitHub, `.env`, Coolify token). Read-only. |
| `pnpm launch` | Put the project online on Coolify, once (see below). |
| `pnpm kit-update` | Bring the latest kit (scripts, workflows, Dockerfile, guide) from the template into this app, as a pull request. From the template: `pnpm kit-update ../my-shop`. |
| `pnpm update-deps` | Safe package updates (what the Monday workflow runs). |
| `pnpm keys` | Which integration keys this app needs and where each is set. `pnpm keys set NAME --test\|--live`, `pnpm keys add-file f.json --test\|--live`, `pnpm keys push`. |
| `pnpm backup` | Back up the production database now and check it (incl. the off-site copy). |
| `pnpm test` | Run the tests. |
| `pnpm typecheck` / `pnpm lint` | Check types / lint. |
| `pnpm build` | Production build (no env vars needed). |
| `pnpm db:generate` | After you change a table in `src/db/schema/`, create a new migration in `/drizzle`. |
| `pnpm db:migrate` | Apply migrations to the database in `.env`. |
| `pnpm db:seed` | Create the first admin if none exists. |
| `pnpm db:studio` | Browse the database in your browser. |

### Changing the database

1. Edit or add a table in `src/db/schema/` (export it from `src/db/schema/index.ts`).
2. `pnpm db:generate --name describe_the_change`. Commit the new files in `/drizzle`.
3. `pnpm db:migrate` locally. On Coolify the migration runs automatically on the next deploy.

`pnpm ship` stops you if you changed `src/db/schema/` but forgot step 2.

Never use `drizzle-kit push` against a real database. It changes tables without a migration file.

---

## Put it online (Coolify)

### One-time setup on your computer

Two small files, **never** committed to git:

- `~/.config/coolify/coolify_url.txt`: the address you open Coolify at, e.g. `https://coolify.buildcity.cloud`
- `~/.config/coolify/coolify_token.txt`: a token from Coolify → **Keys & Tokens → API tokens**
  with the **write** and **deploy** permissions. Delete it in Coolify at any time to switch this off.
  `pnpm ship`, `release` and `status` use it too, to follow deployments and check backups. They still
  work without it, with less detail.

Optional but needed for a real launch:

- `~/.config/coolify/resend_api_key.txt`: a [Resend](https://resend.com/api-keys) API key ("Sending access").
- `~/.config/coolify/email_domain.txt`: the domain you verified in Resend, e.g. `mail.buildcity.cloud`.
  Apps send from `noreply@<that domain>`. If the file is missing, the server's wildcard domain is used.
  With it, launched apps send real email (new-user password links, password reset). Without it, new users
  **cannot verify their email and cannot sign in**.

Coolify also needs your GitHub connected (**Sources → GitHub App**). For off-site backups, add an S3
storage (e.g. Cloudflare R2) under **Storages**.

### Launch (once per project)

Inside the project, with your work pushed to GitHub:

```bash
pnpm launch
```

(Add `--admin-email you@example.com` if your git email is not the one you want as admin.)

It creates, in a new Coolify project named after the repo:

| What | Details |
| --- | --- |
| **App** | Linked to the repo's default branch, at `https://<repo>.<your wildcard domain>`. Health check on `/api/health`. |
| **Production database** | Postgres. **Backed up every night at 03:00 IST**, 7 copies kept on the server and 30 days on your S3/R2 storage. |
| **Preview database** | A separate Postgres used only by pull request previews, so a pull request never touches real data. |
| **Environment variables** | Database links, secrets and admin password are generated. Previews get their own set. |

Then it deploys, waits until the app answers, **emails you a link to set your admin password**, saves the
web address on the GitHub repo, turns on security alerts, and **runs a test backup** to prove backups work
(including the off-site copy, which Coolify would otherwise not warn you about if it failed).

### After launch, everything is automatic

| You do | What happens |
| --- | --- |
| `pnpm ship "message"` (opens a pull request) | GitHub runs the checks (lint, types, tests, build). Coolify builds a **preview** and posts its link on the pull request, e.g. `https://1.my-shop.buildcity.cloud`. `ship` waits and prints it. |
| `pnpm ship` again on the same branch | The checks and the preview update. |
| `pnpm release` (merges into the default branch) | **Production deploys.** Migrations run first. If they fail, the old version keeps running. `release` waits and tells you when it is live. |

**Where things are:**

- Admin password: you get an email after launch to set it. Later: **Forgot password** on the sign-in page
  (works on previews too: they only email the admin).
- Backups: Coolify → your production database → **Backups**. To restore, follow
  [the guide](docs/GUIDE.md#9-restore-a-backup) exactly. Coolify's default restore command does **not** replace existing data.
- Email: with a Resend key, production sends to everyone (`EMAIL_MODE=live`) and previews only to your admin
  email (`allowlist`). Without one it is **off** (`log`): add `RESEND_API_KEY` and set `EMAIL_MODE=live` in the
  app's Environment Variables, then redeploy.

**Good to know:** all previews share one preview database. If two open pull requests change the
database in different ways, they can get in each other's way. Merge one before starting the next.

### Production checklist (once, for the whole server)

| | Item | Where |
| --- | --- | --- |
| ☐ | **Verify your sending domain in Resend** (e.g. `mail.buildcity.cloud`). Add the DNS records Resend shows you. | resend.com → Domains |
| ☐ | Save the Resend key in `~/.config/coolify/resend_api_key.txt` and the domain in `~/.config/coolify/email_domain.txt`. | your computer |
| ☑ | Alerts by email when a deploy, backup or the server fails, or the disk fills up. | Coolify → Notifications |
| ☑ | Off-site database backups to Cloudflare R2. | Coolify → Storages |
| ☐ | **Back up Coolify itself** to R2, so its settings survive if the server dies. | Coolify → Settings → Backup |
| ☐ | Delete API tokens you no longer need (keep the one in `coolify_token.txt`: ship, release and status use it). | Coolify → Keys & Tokens |
| ☑ | Restore drill: restored a backup from R2 and checked the data (2026-10-06). Repeat once per project. See [the guide](docs/GUIDE.md#9-restore-a-backup). | Coolify → database → Import Backup |

**What protects production:**

- A deploy only replaces the running version if the build succeeds **and** `/api/health` answers
  (database included). Otherwise the old version keeps running and you get an alert email.
- Migrations run before the new version starts. If they fail, it does not start.
- GitHub's checks show a red ✗ on pull requests that fail lint, types, tests or build. `pnpm release` refuses
  to merge those. (GitHub's own merge button can't be blocked on the free plan, so use `pnpm release`.)
- Write migrations so the *old* version still works with the new database (add columns, do not rename or
  drop them in the same release). During a deploy, the old version keeps serving traffic for a short while.

### Automatic maintenance

| What | When | You do |
| --- | --- | --- |
| Database backup (+ off-site copy) | Every night, 03:00 IST | Nothing. `pnpm status` shows if last night's failed. |
| Security alerts for your packages | When GitHub finds a problem | Read the email; ask Claude to fix it. |
| Safe package updates (same major version, at least a day old) | Every Monday, 09:00 IST, as a pull request "Weekly dependency updates" | If its checks are green and the preview works: `pnpm release <number>`. |
| Bigger upgrades (e.g. Next.js 17) | Listed in that pull request | Ask Claude when you have time. |
| New versions of this kit | When the template improves | `pnpm kit-update` in your app. |

### What happens when the app starts

On every start the container:

1. checks all environment variables (stops if any is wrong),
2. runs database migrations (stops if they fail, so a broken version never goes live),
3. creates the first admin if there is none,
4. starts the server on `0.0.0.0:3000`.

To check the image builds before pushing:

```bash
docker build -t app-factory .
```

---

## Project layout

```
src/
  env.ts                 every environment variable, validated (rules in lib/env-schema.ts)
  instrumentation.ts     validates env when the server starts
  db/                    Drizzle client (pool max 5) and schema
  lib/
    auth.ts              Better Auth server config
    auth-client.ts       Better Auth client for React components
    session.ts           requireUser() / requireAdmin(): use in every protected page and action
    email/               the only place email is sent (EMAIL_MODE logic)
    money.ts             paise helpers and ₹ formatting
    datetime.ts          Asia/Kolkata date formatting
  app/
    (auth)/              sign-in, forgot/reset password (no public sign-up: the admin creates users; /sign-up redirects to /sign-in)
    dashboard/           example protected page + server actions
    admin/               admin-only page
    api/auth/[...all]    Better Auth endpoints
    api/health           200 if the database answers, else 503
scripts/                 migrate.ts and seed-admin.ts (bundled into the image),
                         new-app, dev, ship, release, status, checkup, launch, keys, backup,
                         kit-update and update-deps (run on your computer); rules in scripts/lib/*.ts
.claude/skills/          the slash commands for Claude Code (/ship, /release, /health, ...)
drizzle/                 SQL migrations (commit these)
Dockerfile               multi-stage, standalone output, non-root user
docker-entrypoint.sh     migrate → seed → start
docker-compose.dev.yml   local Postgres (started by pnpm dev)
.github/workflows/       ci.yml: lint, typecheck, test, build on every pull request
                         weekly-updates.yml: Monday pull request with safe package updates
```
