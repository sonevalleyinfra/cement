---
name: restore
description: Put the production database back to an earlier backup, step by step (Coolify has no restore API, so the owner clicks; Claude guides and checks).
disable-model-invocation: true
allowed-tools: Bash(pnpm backup) Bash(pnpm status)
---

Guide the owner through a restore, following `docs/GUIDE.md` section 9 **exactly** (it was tested).

1. Explain first: everything changed after the chosen backup is lost. Ask which point in time they want.
2. Run `pnpm backup` first, so this can be undone. Don't continue if it fails.
3. Walk through the steps one at a time, waiting for the owner after each: pick the backup and copy its path;
   stop the app; replace the import command with
   `pg_restore -U $POSTGRES_USER -d ${POSTGRES_DB:-${POSTGRES_USER:-postgres}} --clean --if-exists`;
   restore from S3 and read the log (look for `pg_restore: error`; ignore "exit code 0"); start the app.
4. Afterwards run `pnpm status` and check production is healthy. Ask the owner to check the data looks right.
