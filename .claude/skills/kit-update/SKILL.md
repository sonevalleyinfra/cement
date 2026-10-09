---
name: kit-update
description: Bring the newest App Factory tools (scripts, slash commands, workflows, Dockerfile, guide) into this app as a pull request.
argument-hint: "[../app-folder when run in app-factory]"
disable-model-invocation: true
allowed-tools: Bash(pnpm kit-update *) Bash(pnpm kit-update)
---

Run `pnpm kit-update $ARGUMENTS` with the Bash tool in the background.

- Inside an app: it gets the kit from the template on GitHub. Inside app-factory: give the app folder, e.g. `../my-shop`
  (for apps made before this command existed).
- It needs no unsent changes (offer `/ship` first). It only replaces kit files, never the app's own code,
  then ships them as a pull request.
- Report the pull request and preview links; the owner releases it with `/release` like any change.
