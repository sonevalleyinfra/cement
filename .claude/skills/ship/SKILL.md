---
name: ship
description: Send the current changes for review - run all checks, commit, push, open or update the pull request, and get the preview link. Use when the owner says ship it / send it / open a PR.
argument-hint: "[what changed, in a few words]"
disable-model-invocation: true
allowed-tools: Bash(pnpm ship *) Bash(git status *) Bash(git diff *)
---

Ship the current work with `pnpm ship`.

1. Description: use "$ARGUMENTS". If it is empty, look at `git status` and `git diff` and write a short,
   plain description of the change yourself (e.g. "Add products page"), under 60 characters.
2. Run `pnpm ship "<description>"` with the Bash tool **in the background** (it waits for GitHub's checks and the
   preview, which can take 10 minutes). Report when it finishes.
3. Results:
   - Success: give the pull request link and the preview link, and say: try it, then `/release`.
   - A local check failed (lint, typecheck, test or build): nothing was sent. Fix the problem in the code, then run
     `pnpm ship` again with the same description. Try at most 3 times, then explain what's wrong in plain words.
   - "no migration": the database tables changed without a migration. Follow `/db-change` steps, then ship again.
   - GitHub's checks failed: follow `/fix-checks`.
4. Never use `git push --force`, and never commit `.env` files or anything from the key safe.
