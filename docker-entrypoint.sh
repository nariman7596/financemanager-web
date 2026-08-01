#!/bin/sh
# Runs when the container starts: bring the database schema up to date, then
# launch the app. Safe to run every start (both operations are idempotent).
set -e

echo "→ Applying database schema…"
if [ -d prisma/migrations ] && [ -n "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  # Versioned migrations exist → apply them (safe for real data).
  npx prisma migrate deploy
else
  # No migrations yet → push the schema directly (fine for first deploy).
  npx prisma db push --skip-generate
fi

echo "→ Starting FinanceManager on :${PORT:-3000}"
exec npm run start
