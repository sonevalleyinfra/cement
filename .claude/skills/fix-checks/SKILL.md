---
name: fix-checks
description: Fix a red ✗ on a pull request - read which GitHub check failed and why, reproduce it locally, fix the code and ship again.
argument-hint: "[PR number]"
allowed-tools: Bash(gh pr checks *) Bash(gh pr view *) Bash(gh run view *) Bash(gh run list *) Bash(pnpm lint) Bash(pnpm typecheck) Bash(pnpm test) Bash(pnpm build)
---

Fix the failing checks on pull request $ARGUMENTS (or the current branch's pull request).

1. `gh pr checks <number>` to see what failed, then `gh run view <run id> --log-failed` for the error.
2. Make sure you are on the pull request's branch (`gh pr view <number> --json headRefName`, then `git switch` to it).
3. Reproduce locally with the same command (`pnpm lint`, `pnpm typecheck`, `pnpm test` or `pnpm build`).
4. Fix the cause (not the test, unless the test is wrong; explain which). Run all four checks.
5. `pnpm ship "Fix <what>"` in the background, and report the result in plain words.
