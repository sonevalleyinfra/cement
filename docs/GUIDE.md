# App Factory: the beginner's guide

This guide explains, step by step, how to build a web app with this template and run it on the internet.
You don't need to know how servers work. Read part 1 once, then use the other parts when you need them.

**The short version.** Day to day you only need these:

```
pnpm dev                     work on your app at http://localhost:3000
pnpm ship "what I changed"   send it for review: checks, pull request, preview link
pnpm release                 put it live (only if the checks are green)
pnpm status                  is everything OK? what should I do next?
```

Everything else (servers, databases, backups, previews, updates, alerts) is set up once and then runs by itself.

**Using Claude?** Every activity is also a slash command: type `/howto` in Claude Code for the list.
For example `/ship`, `/release`, `/health`, `/integrate razorpay`, `/fix-checks`, `/diagnose`.

**Contents**

1. [The big picture](#1-the-big-picture)
2. [Check your computer is ready](#2-check-your-computer-is-ready)
3. [Start a new project](#3-start-a-new-project)
4. [Everyday development on your computer](#4-everyday-development-on-your-computer)
5. [Put the project online (launch)](#5-put-the-project-online-launch)
6. [After launch: the everyday cycle](#6-after-launch-the-everyday-cycle)
7. [Settings and secrets (environment variables)](#7-settings-and-secrets-environment-variables)
8. [Backups](#8-backups)
9. [Restore a backup](#9-restore-a-backup)
10. [When something goes wrong](#10-when-something-goes-wrong)
11. [Deleting a project](#11-deleting-a-project)
12. [Safety habits](#12-safety-habits)
13. [Cheat sheet](#13-cheat-sheet)
14. [Automatic maintenance](#14-automatic-maintenance)
15. [Keys for integrations (Razorpay, LiveKit, Google, Firebase...)](#15-keys-for-integrations-razorpay-livekit-google-firebase)
16. [Slash commands in Claude](#16-slash-commands-in-claude)

---

## 1. The big picture

Your app lives in **three places**:

```
 YOUR COMPUTER                 GITHUB                          YOUR SERVER (Coolify)
 ─────────────                 ──────                          ─────────────────────
 you write code      push →    stores the code      →          builds and runs the app
 localhost:3000                runs the checks                 my-shop.buildcity.cloud
 local test database           (lint, tests, build)            + databases + backups
```

And there are **three copies of your app** (called *environments*):

| Environment | Address | Database | Who uses it |
| --- | --- | --- | --- |
| **Local** | http://localhost:3000 | a test database in Docker on your computer | only you, while coding |
| **Preview** | `https://<PR number>.my-shop.buildcity.cloud` | a separate *preview* database on the server | you, to try a change before it goes live |
| **Production** | `https://my-shop.buildcity.cloud` | the *production* database (real data, backed up every night) | your real users |

### Words you will see

| Word | Meaning |
| --- | --- |
| **Repository (repo)** | The project's folder of code, stored on GitHub. |
| **Branch** | A separate line of work inside the repo. `master` is the main branch: whatever is on `master` is what runs in production. You make changes on a new branch, so `master` stays safe. |
| **Commit** | A saved snapshot of your changes, with a short message. |
| **Push** | Send your commits from your computer to GitHub. |
| **Pull request (PR)** | A request to merge your branch into `master`. GitHub checks it, and the server builds a preview of it. |
| **Merge** | Accept a pull request: its changes go into `master`, and production updates. |
| **Deploy** | The server building and starting a new version of your app. |
| **Environment variable** | A setting given to the app from outside the code, such as a database address or a secret key. |
| **Migration** | A file that describes a change to the database tables (e.g. "add a products table"). |
| **Coolify** | The control panel that runs your apps on your server: https://coolify.buildcity.cloud |

---

## 2. Check your computer is ready

This was set up once already. Use this if something stops working, or on a new computer.
In any project folder (or `app-factory`), run:

```bash
pnpm checkup
```

It checks Node.js, pnpm, git, the GitHub login, Docker, your `.env` and your Coolify/Resend files,
and prints exactly how to fix anything marked ✗. Things marked · are only needed to put apps online.
(It's called `checkup` because `pnpm doctor` is one of pnpm's own commands.)

Your launch settings live in `~/.config/coolify/` on your computer (never in the code):

| File | What it is | Needed for |
| --- | --- | --- |
| `coolify_url.txt` | `https://coolify.buildcity.cloud` | `pnpm launch` |
| `coolify_token.txt` | a Coolify API token (secret) | `pnpm launch` (only on launch day; see [section 5](#5-put-the-project-online-launch)) |
| `resend_api_key.txt` | your Resend key for sending email (secret) | `pnpm launch` |
| `email_domain.txt` | `mail.buildcity.cloud` | `pnpm launch` |

Check they exist (this does not show their contents):

```bash
ls -l ~/.config/coolify/
```

---

## 3. Start a new project

Do this once per new app. Pick a name: lowercase letters, numbers and hyphens, e.g. `my-shop`.
The name becomes the GitHub repo name **and** the web address (`my-shop.buildcity.cloud`).
Add `--launch` to the command below to put it online straight away (see [section 5](#5-put-the-project-online-launch)).

```bash
cd ~/Desktop/buildcityprojects/app-factory
```
```bash
git pull
```
```bash
pnpm new-app my-shop
```

What happens:

1. A private GitHub repo `my-shop` is created from this template.
2. It is copied to `~/Desktop/buildcityprojects/my-shop`.
3. A `.env` file (local settings) is made, with its own database port so it doesn't clash with your other projects.
4. Packages are installed, the local database starts, and the app starts.

When you see `✓ Ready`, open **http://localhost:3000**.

- Sign in with **`sonevalleyinfra@gmail.com`** / **`123456`** (local only, just for testing).
  To pick your own password: **Dashboard → Change password**.
- To stop the app, click in the terminal and press **Ctrl + C**.
- Open the `my-shop` folder in your code editor. From now on, work in that folder, not in `app-factory`.

> Nothing is on the internet yet. That happens in [section 5](#5-put-the-project-online-launch).

---

## 4. Everyday development on your computer

### Start working

```bash
cd ~/Desktop/buildcityprojects/my-shop
```
```bash
pnpm dev
```

This starts the local database (in Docker), updates its tables, and starts the app at http://localhost:3000.
Leave the terminal open. When you save a file, the browser updates by itself.

It fixes the usual problems by itself: no `.env` file yet (e.g. you cloned the project on a new computer)
→ it makes one; another project already uses the database port → it moves this one to a free port and
says so; Docker is off → it tells you how to start it.

**Emails on your computer are not sent.** They are printed in the terminal where `pnpm dev` runs.
For example, to test "forgot password", look in the terminal for the reset link and open it.

### Send a change for review: `pnpm ship`

When something works on http://localhost:3000, send it with one command and a few words saying what
you changed:

```bash
pnpm ship "Add products page"
```

What it does, in order:

1. Runs the same checks GitHub will run: lint, typecheck, tests, build. If one fails, it stops and
   **nothing is sent**. Fix it (or ask Claude: *"pnpm ship failed at test, please fix it"*) and run it again.
2. Stops you if you changed database tables but forgot the migration (see below).
3. If you're on `master`, moves your work to a new branch (here `add-products-page`). `master` is never changed directly.
4. Saves (commits) everything, sends it (pushes) to GitHub, and opens a **pull request**.
5. Waits for GitHub's checks, then (once the app is launched) for the **preview link**, and prints it.

Waiting takes a few minutes. Pressing Ctrl + C is safe: your work is already on GitHub.

Want to change more? Edit, then run `pnpm ship "Fix the price format"` again. On the same branch it
updates the same pull request and its preview.

When you're happy, put it live with `pnpm release` (see [section 6](#6-after-launch-the-everyday-cycle)).
It merges the pull request, takes your computer back to `master`, and you're ready for the next change.

<details>
<summary>What <code>ship</code> and <code>release</code> do, as plain git commands</summary>

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
git switch -c add-products-page
git add -A && git commit -m "Add products page"
git push -u origin add-products-page
gh pr create --fill
# later, when the checks are green:
gh pr merge --squash --delete-branch && git switch master && git pull
```
</details>

### Changing the database tables

1. Edit or add a table in `src/db/schema/` (and export it from `src/db/schema/index.ts`).
2. Create a migration file:
   ```bash
   pnpm db:generate --name add_products
   ```
3. Stop `pnpm dev` (Ctrl + C) and start it again. It applies the migration to your local database.
4. `pnpm ship` sends the new files in the `drizzle/` folder together with your code. (If you forget
   step 2, `ship` stops and reminds you.)

On the server, migrations run by themselves on the next deploy.

**Rules that keep production safe:**

- Never run `drizzle-kit push`. Always use migrations.
- Never edit or delete an old migration file. Add a new one instead.
- Prefer **adding** columns. Don't rename or delete a column in the same change that stops using it:
  during a deploy, the old version of the app still runs for a short moment and still expects it.

---

## 5. Put the project online (launch)

Do this **once per project**, when you want it on the internet. You can launch early. It's useful to
launch as soon as you want preview links for your pull requests.

### Before you start

1. Your work is on GitHub's `master` (Coolify builds what is on GitHub). A brand-new project already is.
2. `~/.config/coolify/coolify_token.txt` holds a working Coolify token. If you deleted it after the
   last launch (good habit!), make a new one:
   1. Coolify → **Keys & Tokens** → **API tokens** → create a token with **write** and **deploy** permissions.
   2. Copy it, then in a **real terminal window** (not Claude's `!` box, which can't answer questions) run:
      ```bash
      read -rs -p "Paste Coolify token: " k && printf '%s\n' "$k" > ~/.config/coolify/coolify_token.txt && chmod 600 ~/.config/coolify/coolify_token.txt && unset k && echo " saved"
      ```
      The token isn't shown while you paste. That's normal.

### Launch

Use your **real** email address. It becomes the admin login, and password-reset emails go there.

```bash
cd ~/Desktop/buildcityprojects/my-shop
```
```bash
pnpm launch --admin-email you@gmail.com
```

It takes about 5 minutes. You'll see each step:

```
==> Creating the production database
==> Scheduling nightly backups at 03:00 IST (kept on the server and in "R2 backups coolify")
==> Creating the preview database (for pull requests)
==> Starting both databases
==> Creating the app at https://my-shop.buildcity.cloud
==> Saving environment variables (previews first, then production)
==> Starting the first deployment (building takes a few minutes)
==> Testing the backup (runs one now)
    backup: saved
==> Done! https://my-shop.buildcity.cloud is up and healthy.
```

### Right after launch

1. **Check your email** (and spam): you get a "reset your password" email from the app. Open the link
   and choose your admin password. The link works for 1 hour. If it expired, go to
   `https://my-shop.buildcity.cloud/sign-in` → **Forgot password**.
2. Sign in at `https://my-shop.buildcity.cloud/sign-in` with your email and that password.
3. Keep the Coolify token: `pnpm ship`, `release` and `status` use it to follow deployments and check
   backups. (They still work without it, but can't tell you when a deploy finished or failed.)

Launch also writes the web address on the GitHub repo page and turns on GitHub security alerts.

### If the launch stops half-way

It prints `!! Launch stopped half-way` and the reason. Then:

1. Open the Coolify link it printed, delete everything inside the half-made project (the app and both
   databases), then delete the project.
2. Fix the reason (see [section 10](#10-when-something-goes-wrong)) and run `pnpm launch` again.

---

## 6. After launch: the everyday cycle

Everything below happens **by itself**. You only write code and run two commands.

```
 code → pnpm ship "..." ──→ GitHub checks it (✓ or ✗)
                        └─→ Coolify builds a PREVIEW (e.g. https://1.my-shop.buildcity.cloud)
                            ship prints the link when it's ready
 try the preview → pnpm release ──→ merged only if ✓ → Coolify updates PRODUCTION (2-5 minutes)
                                    release tells you when it's live
```

### Putting it live: `pnpm release`

```bash
pnpm release
```

Run it on the branch you shipped (or `pnpm release 12` for pull request #12, e.g. a weekly update). It:

1. **refuses** if GitHub's checks failed or are still running, or if the pull request clashes with
   newer changes on `master` (it tells you what to ask Claude),
2. refuses if you have changes that aren't shipped yet (so nothing is left behind),
3. merges, deletes the branch, and brings your computer back to an up-to-date `master`,
4. waits until production runs the new version, and says **✓ Live**, or, if the new version failed,
   that the old version is still running and where the log is.

Don't use GitHub's **Merge** button: on the free plan it can't stop you merging a red ✗. `pnpm release` does.

### Is everything OK? `pnpm status`

```bash
pnpm status
```

One screen with: is production up, last deploy, database, **last night's backup**, open pull requests
with their checks and preview links, what on your computer isn't sent yet, and **NEXT:** the one thing
to do now. It never changes anything, so run it whenever you like.

### Using a preview

- The link appears as a comment on the pull request, and updates every time you push to that branch.
- Previews use the **preview database**, never your real data. Try anything there.
- To sign in on a preview as admin: **Forgot password** on its sign-in page (previews only email you).
- Previews only send email to **your** admin address, never to real users.
- When you merge or close the pull request, its preview is removed.
- All previews share one preview database. If two open pull requests change the tables in different
  ways, they can clash. Merge one before starting the next.

### Production updates

When a pull request is merged into `master`, Coolify builds the new version, runs the database migrations,
and switches over **only if** the new version starts and its health check (`/api/health`) answers.
If anything fails, **the old version keeps running** and you get an alert email.

`pnpm release` follows the deploy for you. To watch it yourself: Coolify → your project → your app → **Deployments**.

### Going back to the previous version

If a new version has a bug: Coolify → your app → **Rollback** → pick the previous version.
This puts back the old **code**. It does **not** undo database changes. That's one more reason to only
*add* things in migrations (see [section 4](#changing-the-database-tables)).
Usually the better fix is a quick new pull request.

---

## 7. Settings and secrets (environment variables)

Each app's settings are in Coolify → your app → **Environment Variables**:

| Variable | What it does |
| --- | --- |
| `DATABASE_URL` | Address and password of the database. Don't change it. |
| `BETTER_AUTH_SECRET` | Secret that protects sign-ins. Changing it signs everyone out. |
| `EMAIL_MODE` | `live` = send email to everyone. `allowlist` = only to `EMAIL_ALLOWLIST`. `log` = send nothing. |
| `EMAIL_FROM` | Sender, e.g. `my-shop <noreply@mail.buildcity.cloud>`. Must be on your Resend-verified domain. |
| `RESEND_API_KEY` | Key for sending email through Resend. |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | The first admin. Only used if no admin exists yet. |

**After changing a variable, click Redeploy.** The running app only reads them when it starts.

Adding a *new* setting to the code takes a few steps (see `CLAUDE.md`). Easiest: ask Claude to do it.
Never put secrets in variables that start with `NEXT_PUBLIC_`, because those are visible to everyone in the browser.

---

## 8. Backups

**Automatic:** every night at **03:00 India time**, the production database is backed up.
`pnpm status` shows whether last night's backup (and its off-site copy) worked.

- 7 copies are kept on the server.
- A copy also goes to Cloudflare **R2** (off-site storage) and is kept for **30 days**. If the whole
  server dies, the R2 copy survives.
- If a backup fails, Coolify emails you.

**See your backups:** Coolify → your project → `my-shop-db` → **Backups**. Each line is one backup with
its date, size and status.

**Make one right now** (do this before anything risky, like a big database change, or a restore):
the same page → **Back up now**.

The preview database is not backed up. It only holds test data.

---

## 9. Restore a backup

A restore puts the database back exactly as it was at the time of the backup.
**Everything that changed after that backup is lost** (new users, orders, edits). So:

> **Before restoring, make a fresh backup (Back up now).** If you restore the wrong backup, you can restore
> this fresh one to undo it.

This exact procedure was tested on 2026-10-06 (restored from R2, and the data went back to the earlier state).

### Step 1: Pick the backup and copy its path

Coolify → your project → `my-shop-db` → **Backups**. Choose the backup from the time you want to go back
to, and copy its **file path**. It looks like this:

```
/data/coolify/backups/databases/root-team-0/my-shop-db-<letters>/pg-dump-app-<numbers>.dmp
```

### Step 2: Stop the app

Coolify → your app → **Stop**. This makes sure nobody changes data while you restore.
Your site shows an error page until step 5. That's expected.

### Step 3: Fix the restore command (important!)

Coolify → `my-shop-db` → the **Import Backup** page (titled **Restore database**). Find the
**Import command** box (it starts with `pg_restore -U`) and replace its contents with:

```
pg_restore -U $POSTGRES_USER -d ${POSTGRES_DB:-${POSTGRES_USER:-postgres}} --clean --if-exists
```

Without `--clean --if-exists` the restore fails with "already exists" errors and your data is **not** replaced,
even though the page says "All existing data will be replaced".

### Step 4: Restore from R2

Still on the same page, choose S3 as the **Backup source**, then:

1. **S3 storage:** `R2 backups coolify`
2. **File path:** paste the path from step 1.
3. Click **Check file**. It should find the file and show its size.
4. Click **Restore** and confirm with your Coolify password.
5. Read the log that opens.

**How to read the log:**

- Good: you see the file being downloaded (`... -> /tmp/pg-dump-app-....dmp`), and **no** lines with `error`.
- Bad: lines like `pg_restore: error: ...` or `errors ignored on restore: 3`. Don't start the app.
  Copy the log and ask for help.
- Ignore the last line, `Import finished with exit code 0`. Coolify always prints 0, even when the restore failed.

### Step 5: Start the app and check

1. Coolify → your app → **Deploy**. Wait until it's running.
2. Open `https://my-shop.buildcity.cloud/api/health`. It must show `{"status":"ok","database":"ok"}`.
3. Sign in and check that the data looks like it did at the time of the backup.

### Practise once

Do a practice restore once on every new project, before it has real users: change something, back up,
change it again, restore, and check it went back. A backup you have never restored is only a hope.

---

## 10. When something goes wrong

**First, run `pnpm status`** (what's wrong with the app?) **or `pnpm checkup`** (what's wrong with my computer?).
Both explain the fix. For anything else, ask Claude: describe what you see, in your own words.

| What you see | What it means | What to do |
| --- | --- | --- |
| `pnpm dev`: **Docker is not running** | The local database needs Docker. | Start Docker, then run `pnpm dev` again. |
| `pnpm dev`: **port is already allocated** | Rare now: `pnpm dev` normally moves to a free port by itself. | Run `pnpm dev` again. If it repeats, in the other project's folder run `docker compose -f docker-compose.dev.yml stop`. |
| `pnpm ship`: **"pnpm lint/typecheck/test/build" failed** | Your code has a problem the checks found. Nothing was sent. | Read the error above it, or ask Claude: *"pnpm ship failed, please fix it"*. Then `pnpm ship` again. |
| `pnpm ship`: **you changed the database tables but there is no migration** | You edited `src/db/schema/` without `pnpm db:generate`. | Run `pnpm db:generate --name what_changed`, restart `pnpm dev`, then `pnpm ship` again. |
| `pnpm release`: **checks failed** / **merge conflict** | It refused to merge. Production is unchanged. | Ask Claude what it says (e.g. *"fix the merge conflicts on PR #12"*), then `pnpm release` again. |
| `pnpm release`: **did not build or start** | The new version failed. **The old version is still running.** | Ask Claude: *"the production deploy failed, please check"*. |
| **Invalid environment variables** | A setting is missing or wrong. The message names it. | Locally: fix it in `.env`. On the server: fix it in Coolify → Environment Variables, then Redeploy. |
| Red **✗** on a pull request | A check failed (lint, types, tests or build). | Click **Details** to read the error, fix it, `pnpm ship` again. `pnpm release` won't merge it while it's red. |
| `launch`: **failed: 401** | The Coolify token is wrong or was deleted. | Make a new token ([section 5](#before-you-start)). |
| `launch`: **failed: 403** | The token lacks permissions. | Create one with **write** and **deploy**. |
| `launch`: **already has a project called ...** | This project was launched before. | Nothing to do, it's online. Push to `master` to update it. |
| `launch`: **cannot receive email** | Your git email is GitHub's "noreply" address. | Add `--admin-email you@gmail.com`. |
| Alert email: **deployment failed** | The new version didn't build or start. The old version is still running. | Coolify → app → **Deployments** → open the failed one → read the log. Fix, push again. |
| Site shows **no available server** or **503** | The app is stopped or unhealthy. | Coolify → app: check its status and latest deployment. Click **Start** or **Redeploy**. |
| Users don't get emails | Email is off, or the sender domain isn't verified. | Check `EMAIL_MODE=live` and `EMAIL_FROM` in Coolify. Check resend.com → **Emails** for errors. Check spam. |
| No preview link on a pull request | Not launched yet, or the build failed. | Launch first. Otherwise check Coolify → app → **Deployments** for the preview build. |

**Asking Claude for help:** open Claude in your project folder and describe what you see. Claude knows
these commands (they're in `docs/OPERATIONS.md`), and can check Coolify's status, deployments and backups
for you. To read build logs too, give your Coolify token the **read:sensitive** permission.

---

## 11. Deleting a project

Only do this if you're sure. **Deleting the production database deletes your data.**
If you might need the data later, make a backup first and keep a note of its R2 path.

1. **Coolify:** open the project, delete the app and both databases, then delete the project.
2. **GitHub:** the repo → **Settings** → bottom of the page (Danger Zone) → **Delete this repository**.
3. **Your computer:** in the project folder run `docker compose -f docker-compose.dev.yml down -v`
   (deletes the local test database), then delete the folder.

---

## 12. Safety habits

- **Secrets stay in files on your computer** (`~/.config/coolify/`) or in Coolify. Never put them in code,
  in git, in chat messages or in screenshots.
- **Keep the Coolify token only on your computer** (`~/.config/coolify/coolify_token.txt`, readable only by you).
  If your laptop is lost or the token leaks, delete it in Coolify → Keys & Tokens and make a new one.
- **Use `pnpm ship` and `pnpm release`.** They never change `master` directly and never merge a red ✗.
  Avoid GitHub's Merge button: on the free plan it can't block a red ✗.
- **Back up before risky changes** (Back up now), and practise a restore once per project.
- Claude's `!` command box can't answer questions (password prompts, "type your email"). Use a real
  terminal window for those commands.

---

## 13. Cheat sheet

| I want to... | Do this |
| --- | --- |
| Start a new app | In `app-factory`: `pnpm new-app my-shop` (add `--launch` to also put it online) |
| Work on my app | In the app folder: `pnpm dev` → http://localhost:3000 |
| Stop the app on my computer | Ctrl + C in its terminal |
| Send my change for review | `pnpm ship "what I changed"` |
| Put it live | `pnpm release` (or `pnpm release 12` for pull request #12) |
| Know if all is well, and what next | `pnpm status` |
| Check my computer is ready | `pnpm checkup` |
| Change the database | Edit `src/db/schema/` → `pnpm db:generate --name what_changed` → restart `pnpm dev` |
| Put the app online (once) | `pnpm launch --admin-email you@gmail.com` |
| Try a change before it's live | The preview link `pnpm ship` printed (also on the pull request) |
| Get the newest version of these tools | In the app folder: `pnpm kit-update` |
| Change a setting on the server | Coolify → app → Environment Variables → edit → **Redeploy** |
| Make a backup now | `pnpm backup` (or Coolify → `my-shop-db` → Backups → **Back up now**) |
| Add a test or live key | `pnpm keys set NAME --test` / `--live` (in a real terminal), then `pnpm keys` to check |
| Restore a backup | [Section 9](#9-restore-a-backup) |
| Undo a bad release | Coolify → app → **Rollback** (code only), or fix it in a new pull request |
| See what's broken | Coolify → app → **Deployments**, or ask Claude |

---

## 14. Automatic maintenance

These run by themselves. You only act when a pull request or an email asks you to.

| What | When | What you do |
| --- | --- | --- |
| **Database backups** (on the server + off-site in R2) | Every night, 03:00 IST | Nothing. `pnpm status` shows if one failed. Coolify emails you too. |
| **Health watch**: deploy failed, server down, disk full | All the time | Coolify emails you. Run `pnpm status` and ask Claude. |
| **Security alerts** for packages the app uses | When GitHub learns of a problem | GitHub emails you. Ask Claude: *"fix the security alert on GitHub"*. |
| **Safe package updates** (bug and security fixes, same major version, at least a day old) | Every Monday 09:00 IST: a pull request called **Weekly dependency updates** | When its checks are ✓ and its preview works: `pnpm release <number>`. If it's ✗, ask Claude to fix it. |
| **Big upgrades** (e.g. a new major Next.js version) | Listed in the Monday pull request | Not urgent. When you have time, ask Claude: *"upgrade next to the new major version"*. |
| **New versions of this kit** (scripts, guide, Dockerfile) | When app-factory improves | In the app folder: `pnpm kit-update`. It opens a pull request like any change; release it the same way. |

**Apps made before these commands existed** (they don't have `pnpm ship` yet): from the `app-factory`
folder run `pnpm kit-update ../my-shop` once. After that, use `pnpm kit-update` inside the app.
It also switches on the GitHub settings the Monday updates need.

---

## 15. Keys for integrations (Razorpay, LiveKit, Google, Firebase...)

Most apps need keys from other services: Razorpay for payments, LiveKit for calls, Google for sign-in,
Firebase, file storage... Each service gives you **test keys** (fake money, safe to play with) and **live keys**
(real money, real users). You keep both in **one key safe on your computer**, shared by all your apps:

```
~/.config/app-factory/
  test.env      test keys    → your computer and pull request previews
  prod.env      live keys    → production only
  test/  prod/  JSON files (e.g. Firebase) → a variable named after the file
```

Only you can read these files. They are never put in git, and you never paste them into chat.

### Fill it once

```bash
pnpm keys
```

The first time, this creates the safe with examples for Razorpay, LiveKit, Google, S3/R2, MSG91 and Sentry.
Then add keys in a **real terminal window** (what you paste is hidden):

```bash
pnpm keys set RAZORPAY_KEY_ID --test
```
```bash
pnpm keys set RAZORPAY_KEY_ID --live
```

For a JSON file you downloaded (e.g. a Firebase service account):

```bash
pnpm keys add-file ~/Downloads/firebase-service-account.json --test
```

(You can also open `~/.config/app-factory/test.env` in your editor and remove the `#` in front of a line.)

### What happens then, by itself

- An app only receives the keys it **lists in its `.env.example`**. `/integrate razorpay` in Claude adds them.
- `pnpm dev` copies the test keys the app needs into its `.env`.
- `pnpm ship` gives the pull request preview the test keys.
- `pnpm release` and `pnpm launch` give production the live keys, and **refuse** if a required live key is missing,
  or if a test key (`rzp_test_...`) would go live, or a live key (`rzp_live_...`) would land on your computer or a preview.
- `pnpm keys` shows a table: each key the app needs, and ✓/✗ for your computer, test keys, live keys,
  previews and production. Run it whenever you're unsure.

Change a key (e.g. you created a new one): `pnpm keys set` it again, then `pnpm keys push` (or just ship and release).
Keys must be changed in the safe, not in Coolify: the safe is the master copy and overwrites Coolify.

---

## 16. Slash commands in Claude

In Claude Code, type `/` and the command. They do the same as the `pnpm` commands, plus Claude fixes things on the way.

| Command | What it does |
| --- | --- |
| `/howto [question]` | The list of commands, or the answer to "how do I..." |
| `/dev` | Start the app on your computer |
| `/ship [what changed]` | Check, save, send for review, and get the preview link. Claude fixes failing checks and tries again. |
| `/release [number]` | Put it live (refuses red checks or missing live keys) |
| `/health` | Is everything OK, and what next (`pnpm status`) |
| `/checkup` | Is this computer ready |
| `/new-app <name>` | New app (in the app-factory folder) |
| `/launch [email]` | Put the app online, once |
| `/keys` | Which keys the app needs and where they're missing. Claude never asks for key values. |
| `/integrate <service>` | Add Razorpay, LiveKit, Google sign-in, Firebase, file storage, SMS, Sentry... |
| `/db-change <what>` | Change the database tables safely |
| `/fix-checks` | Fix a red ✗ on a pull request |
| `/diagnose [what you see]` | Find out why something is broken |
| `/backup` | Back up production now |
| `/restore` | Go back to an earlier backup, step by step |
| `/rollback` | Undo a release |
| `/major-upgrade <package>` | A big upgrade (e.g. Next.js 17), done carefully |
| `/kit-update` | Get the newest version of these tools |

`/status` and `/upgrade` already mean something else in Claude Code, which is why these are `/health` and `/major-upgrade`.
Commands that change things (ship, release, launch...) only run when **you** type them; Claude won't start them on its own.

