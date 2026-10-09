---
name: db-change
description: Change the database tables safely - edit the Drizzle schema, generate a migration, check it can't break production, apply it locally and add tests.
argument-hint: "<what to change>"
disable-model-invocation: true
---

Change the database: $ARGUMENTS. Follow the Database rules in CLAUDE.md.

1. Edit or add tables in `src/db/schema/` (export new files from `src/db/schema/index.ts`).
   Timestamps use `timestamp(..., { withTimezone: true })`; money is integer paise.
2. Run `pnpm db:generate --name <short_snake_case_name>`.
3. Read the generated SQL in `drizzle/`. The old version keeps running for a moment during a deploy, so:
   - adding tables/columns is fine (new NOT NULL columns need a default);
   - **renaming or dropping** a column/table in use would break it. Do it in two releases: first stop using it
     (and add the new one), release, then remove it in a later change. Explain this to the owner.
   - Never edit or delete an older migration; never run `drizzle-kit push`.
4. Apply locally: `pnpm db:migrate` (or restart `pnpm dev`). Add tests for any new business rules.
5. Before releasing a risky change on a launched app, suggest `/backup`. Then `/ship`.
