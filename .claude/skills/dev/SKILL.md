---
name: dev
description: Start this app on the owner's computer (local database + dev server at http://localhost:3000).
allowed-tools: Bash(pnpm dev) Bash(pnpm checkup)
---

Start the app for local development.

1. Run `pnpm dev` with the Bash tool **in the background** (it keeps running). It makes `.env` if missing,
   copies the test keys the app needs from the key safe, moves to a free database port if needed,
   then starts the database, migrations, admin account and Next.js.
2. Wait until its output shows `Ready`, then tell the owner: open http://localhost:3000, sign in with
   `SEED_ADMIN_EMAIL` from `.env` and the local password in `.env` (`SEED_ADMIN_PASSWORD`).
3. If it fails, read the message (it explains the fix in plain words). For Docker not running, tell the owner how
   to start it. Otherwise run `pnpm checkup` and explain.

Emails are not sent on this computer: verification and reset links are printed in the `pnpm dev` output.
When the owner needs one, read it from that output and give them the link.
