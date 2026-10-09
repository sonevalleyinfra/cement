---
name: health
description: Is everything OK? Shows production status, last deploy, database, last backup, open pull requests, unsent work and the next step. Read-only.
allowed-tools: Bash(pnpm status)
---

Run `pnpm status` (read-only) and explain the result in a few plain sentences:
what is fine, what needs attention, and the one next step, written as a slash command
(`/ship`, `/release`, `/fix-checks`, `/diagnose`, `/launch`...).
If backups show a problem, say so first: that is the most important thing to fix.
