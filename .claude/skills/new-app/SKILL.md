---
name: new-app
description: Start a brand-new app from the App Factory template (GitHub repo, local copy, settings, database). Run in the app-factory folder.
argument-hint: "<name> [--launch]"
disable-model-invocation: true
allowed-tools: Bash(pnpm new-app *)
---

Create a new app: $ARGUMENTS

1. Check this is the app-factory template (`gh repo view --json isTemplate` is true). If not, tell the owner to open
   Claude in the app-factory folder.
2. The name must be 3-40 lowercase letters, digits and hyphens, starting with a letter. It becomes the GitHub repo
   and the web address. If it's missing or invalid, suggest one and ask.
3. Run `pnpm new-app <name> --no-dev` (plus `--launch` if given) with the Bash tool in the background.
   `--launch` also puts it online (about 5 minutes more).
4. Tell the owner: the app is in `../<name>`. Open that folder in Claude (and the editor), then type `/dev`.
