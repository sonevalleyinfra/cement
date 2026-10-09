# syntax=docker/dockerfile:1
#
# Production image for Coolify ("Dockerfile" build pack).
# Stage 1 installs dependencies, stage 2 builds, stage 3 is the small image
# that actually runs. Only stage 3 ends up on the server.

# ---------- base: Node + pnpm ----------
FROM node:24-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1
# Corepack installs the exact pnpm version from package.json "packageManager".
RUN corepack enable
WORKDIR /app

# ---------- 1. deps: install node_modules ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    pnpm install --frozen-lockfile --store-dir /pnpm-store

# ---------- 2. builder: build the app ----------
# No secrets are needed here: src/env.ts uses placeholders during `next build`.
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build \
 && pnpm build:scripts

# ---------- 3. runner: what runs in production ----------
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

# Run as a normal user, not root.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nextjs

# The standalone server and only the node_modules it needs.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Migrations + bundled start-up scripts (migrate, seed admin).
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/dist-scripts ./scripts
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./

USER nextjs
EXPOSE 3000

# Docker/Coolify mark the container unhealthy if the database stops answering.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1

# Migrate -> seed admin -> start server (see docker-entrypoint.sh).
CMD ["sh", "docker-entrypoint.sh"]
