---
name: diagnose
description: Something is broken (site down, deploy failed, preview missing, emails not arriving, local errors) - find out why and fix it or explain the fix.
argument-hint: "[what you see]"
allowed-tools: Bash(pnpm status) Bash(pnpm checkup) Bash(gh pr checks *) Bash(gh run view *)
---

The owner sees: $ARGUMENTS

1. Run `pnpm status` (the app) and, for local problems, `pnpm checkup` (the computer). Use `docs/GUIDE.md`
   section 10 and `docs/OPERATIONS.md` (Coolify traps) to explain.
2. A failed deploy: the old version keeps running. The normal token can't read build logs, so reproduce locally:
   `docker build -t app-check .` (same Dockerfile as Coolify). If it builds, compare env vars with `pnpm keys` and
   `src/lib/env-schema.ts`. If you still can't tell, ask the owner to paste the log from Coolify → app → Deployments.
3. Site down but deploy fine: check `/api/health` (database) and the database status in `pnpm status`.
4. Emails not arriving: `EMAIL_MODE`, `EMAIL_FROM` on the Resend-verified domain, spam folder, resend.com → Emails.
5. Fix in code and `/ship`, or tell the owner exactly what to click. Never delete Coolify resources, databases or backups.
