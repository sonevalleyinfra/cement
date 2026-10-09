#!/bin/sh
# Runs every time the container starts.
# `set -e` = stop at the first failing command, so if migrations fail the
# container exits with an error instead of starting a broken app.
set -e

echo "==> Running database migrations"
node scripts/migrate.mjs

echo "==> Making sure an admin account exists"
node scripts/seed-admin.mjs

echo "==> Starting Next.js on ${HOSTNAME}:${PORT}"
# `exec` makes Node the main process so it receives Coolify's stop signal.
exec node server.js
