---
name: checkup
description: Check this computer is ready for development and launching (Node, pnpm, git, GitHub login, Docker, .env, Coolify token, key safe). Read-only.
allowed-tools: Bash(pnpm checkup)
---

Run `pnpm checkup` (read-only). For each ✗, explain the fix in plain words. Do the safe fixes yourself when
they need no password or secret (e.g. `corepack enable`). For anything needing a password, a token or `sudo`,
give the owner the exact command to run in their own terminal. Never read or print files in `~/.config/coolify/`
or `~/.config/app-factory/`.
