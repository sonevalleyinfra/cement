---
name: launch
description: Put this app on the internet once - production and preview databases, nightly backups, the app, its keys, then a test backup.
argument-hint: "[admin email]"
disable-model-invocation: true
allowed-tools: Bash(pnpm launch *) Bash(pnpm launch) Bash(pnpm keys) Bash(pnpm checkup)
---

Launch this app. Follow `docs/OPERATIONS.md` (verified Coolify traps).

1. Before: `pnpm checkup` must show the Coolify token working. Run `pnpm keys`: if production keys are missing,
   stop and explain how to add them (`/keys`). The work must be on GitHub's default branch.
2. Admin email: "$ARGUMENTS" if given, otherwise the git email. It must be a real inbox (not a noreply address).
3. Run `pnpm launch` (add `--admin-email <email>` when given) with the Bash tool in the background
   (about 5 minutes). Report when it finishes.
4. After: tell the owner to check their email for the "reset password" link to choose the admin password,
   then sign in at the printed address. From now on: `/ship` and `/release`.
5. If it stopped half-way, it printed a Coolify link. Tell the owner to delete the half-made project there
   (never delete Coolify resources yourself), fix the reason, and run `/launch` again.
