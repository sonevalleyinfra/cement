---
name: rollback
description: Undo the last release (or a chosen one) by shipping a change that reverses it, then releasing that once checked.
argument-hint: "[PR number to undo]"
disable-model-invocation: true
---

Undo a release.

1. Find it: PR $ARGUMENTS, or the latest from `gh pr list --state merged --limit 5 --json number,title,mergedAt,mergeCommit`.
   Confirm with the owner which one to undo.
2. Warn: this undoes the **code**. Database changes from migrations stay (that's why migrations only add things).
   If the release added a migration, think through whether the old code still works with the new tables.
3. Make sure there are no unsent changes (`git status`), then `git switch <main branch> && git pull`.
4. `git revert --no-edit <merge commit>`, then `pnpm ship "Undo: <title of that PR>"` in the background
   (ship moves the revert onto its own branch and pull request).
5. When its checks are green and the preview looks right, tell the owner to type `/release` to put the undo live.
   For an emergency right now, they can also click Rollback in Coolify → app → Deployments (code only).
