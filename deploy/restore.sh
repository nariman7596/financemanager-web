#!/usr/bin/env bash
#
# Restore a FinanceManager backup. Destructive — it replaces the current data.
#
#   ./deploy/restore.sh ~/backups/fm-2026-08-12_0330.sql.gz
#
# The dumps are taken with --clean --if-exists, so they drop and recreate every
# object. Whatever is in the database now is gone once this finishes.

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$HOME/financemanager-web}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.ghcr.yml}"
DB_USER="${DB_USER:-fm}"
DB_NAME="${DB_NAME:-financemanager}"

archive="${1:-}"
[ -n "$archive" ] || { echo "usage: $0 <backup.sql.gz>" >&2; exit 2; }
[ -f "$archive" ] || { echo "no such file: $archive" >&2; exit 2; }

# Check the archive before touching the live database.
gzip -t "$archive" || { echo "archive is corrupt: $archive" >&2; exit 1; }
zgrep -q 'PostgreSQL database dump' "$archive" \
  || { echo "not a pg_dump archive: $archive" >&2; exit 1; }

cd "$PROJECT_DIR"

cat >&2 <<EOF

  About to restore : $archive
  Into database    : $DB_NAME
  ⚠️  This REPLACES all current data. It cannot be undone.

EOF
read -r -p "Type the word 'restore' to continue: " confirm
[ "$confirm" = "restore" ] || { echo "aborted" >&2; exit 1; }

# Take a safety dump of the current state first, in case this restore is a
# mistake. Cheap insurance.
safety="$HOME/backups/pre-restore-$(date -u '+%Y-%m-%d_%H%M').sql.gz"
mkdir -p "$(dirname "$safety")"
echo "→ snapshotting current data to $safety" >&2
docker compose -f "$COMPOSE_FILE" exec -T db \
  pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists | gzip -9 > "$safety" \
  || echo "  (could not snapshot — continuing anyway)" >&2

echo "→ stopping the app so nothing writes mid-restore" >&2
docker compose -f "$COMPOSE_FILE" stop app cron >/dev/null

echo "→ restoring" >&2
zcat "$archive" | docker compose -f "$COMPOSE_FILE" exec -T db \
  psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 >/dev/null

echo "→ starting the app" >&2
docker compose -f "$COMPOSE_FILE" start app cron >/dev/null

echo "✅ restored from $(basename "$archive")" >&2
