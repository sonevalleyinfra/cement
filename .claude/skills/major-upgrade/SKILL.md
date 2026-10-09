---
name: major-upgrade
description: Do a big (breaking) package upgrade carefully, e.g. Next.js, Better Auth, Drizzle, Tailwind, TypeScript - read the migration guide, upgrade, fix, check and ship.
argument-hint: "<package> [version]"
disable-model-invocation: true
---

Upgrade $ARGUMENTS to its new major version (the Monday update pull request lists them).

1. Read the official upgrade/migration guide and changelog for the target version (WebFetch). For Next.js,
   read `node_modules/next/dist/docs/` after installing.
2. Work on a branch. `pnpm add <package>@<version>` (and its companions together, e.g. `next` + `eslint-config-next`,
   `better-auth` + `@better-auth/drizzle-adapter` + `auth`).
3. Apply the guide's changes. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, then try `pnpm dev`.
4. If a database-related package changed (Drizzle, Better Auth schema), check whether a migration is needed (`/db-change`).
5. `/ship "Upgrade <package> to <version>"`, then the owner tries the preview before `/release`.
   Explain any risk in plain words.
