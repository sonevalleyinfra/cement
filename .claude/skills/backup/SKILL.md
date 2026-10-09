---
name: backup
description: Back up the production database right now and check it worked, including the off-site copy. Use before risky changes or a restore.
allowed-tools: Bash(pnpm backup)
---

Run `pnpm backup` with the Bash tool (up to a minute). Report in plain words: saved (on the server and off-site)
or what went wrong. If it failed, advise not to do anything risky until it is fixed, and offer `/diagnose`.
