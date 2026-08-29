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

WEB=/app/apps/web
DB=/app/packages/db

echo "→ Applying database schema…"
# The schema and its migrations live in packages/db, so this runs from there.
cd "$DB"
if [ -d prisma/migrations ] && [ -n "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  # Versioned migrations exist → apply them (safe for real data).
  ./node_modules/.bin/prisma migrate deploy
else
  # No migrations yet → push the schema directly (fine for first deploy).
  ./node_modules/.bin/prisma db push --skip-generate
fi

echo "→ Starting FinanceManager on :${PORT:-3000}"
cd "$WEB"
exec ./node_modules/.bin/next start
