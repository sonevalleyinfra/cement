// Bundles scripts/migrate.ts and scripts/seed-admin.ts into single .mjs files
// so they can run inside the slim production image (which has no dev tools
// and only the node_modules that Next.js traced). Used by the Dockerfile.
import { build } from "esbuild";

await build({
  entryPoints: ["scripts/migrate.ts", "scripts/seed-admin.ts"],
  outdir: "dist-scripts",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  // `next` is already in the production image. Better Auth only imports
  // next/headers lazily, inside request handlers the scripts never call.
  external: ["next", "next/*"],
  // Lets bundled CommonJS packages call require() inside an ES module.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: "info",
});
