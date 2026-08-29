#!/bin/sh
# Runs when the container starts: bring the database schema up to date, then
# launch the app. Safe to run every start (both operations are idempotent).
#
# The Dockerfile sets WORKDIR to /app/apps/web, so the Prisma schema and the
# workspace's binaries resolve relative to the web app.
#
# These call ./node_modules/.bin directly rather than going through pnpm: a
# package manager in the runtime path would need to download itself from the
# npm registry on first use (see the note in the Dockerfile's runner stage),
# turning every container start into a network dependency.
set -e

BIN=./node_modules/.bin

echo "→ Applying database schema…"
if [ -d prisma/migrations ] && [ -n "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  # Versioned migrations exist → apply them (safe for real data).
  "$BIN/prisma" migrate deploy
else
  # No migrations yet → push the schema directly (fine for first deploy).
  "$BIN/prisma" db push --skip-generate
fi

echo "→ Starting FinanceManager on :${PORT:-3000}"
exec "$BIN/next" start
