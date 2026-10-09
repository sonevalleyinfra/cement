---
name: release
description: Put a reviewed pull request live in production - merges only if checks are green and the live keys are ready, then waits until it is live.
argument-hint: "[PR number]"
disable-model-invocation: true
allowed-tools: Bash(pnpm release *) Bash(pnpm release)
---

Release with `pnpm release $ARGUMENTS`. The owner asked for it by typing this command, so merging is approved
for this pull request only.

1. Run `pnpm release $ARGUMENTS` with the Bash tool **in the background** (it waits for the production deploy,
   2-5 minutes). Report when it finishes.
2. It refuses (and production stays unchanged) when:
   - checks failed or are still running → offer `/fix-checks`, or wait and try again;
   - the pull request conflicts with newer changes → fix the conflict on the branch (merge the main branch into it,
     resolve, run the checks), `pnpm ship`, then ask the owner to run `/release` again;
   - production keys are missing or a test key would go live → explain which keys, and show the owner how to add them
     (`/keys`). Never ask for key values in chat;
   - there are unshipped changes → offer `/ship` first.
3. Success: say it's live, with the link. Failure after merge: the old version is still running; offer `/diagnose`.
