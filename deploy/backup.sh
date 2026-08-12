#!/usr/bin/env bash
#
# Nightly Postgres backup for FinanceManager.
#
# Deliberately not the usual one-liner:
#
#   pg_dump ... | gzip > out.gz && find ... -delete
#
# In that form a failing pg_dump still leaves gzip writing a valid, empty
# archive, the && succeeds, and the prune step deletes the good backups behind
# it. A week of that and every backup is an empty file. This script fails loudly
# instead, and only ever prunes after a dump it has verified.
#
# Install: see docs/BACKUP.md

set -euo pipefail

# ---------------------------------------------------------------------------
# Config (override via environment)
# ---------------------------------------------------------------------------
PROJECT_DIR="${PROJECT_DIR:-$HOME/financemanager-web}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.ghcr.yml}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
DB_USER="${DB_USER:-fm}"
DB_NAME="${DB_NAME:-financemanager}"
# Uncompressed size floor. A real dump of even an empty schema runs to several
# KB of DDL, so anything under this means the dump did not really happen.
MIN_BYTES="${MIN_BYTES:-2048}"

LOG_FILE="${LOG_FILE:-$BACKUP_DIR/backup.log}"

log() { printf '%s  %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" | tee -a "$LOG_FILE" >&2; }
die() { log "FAILED: $*"; exit 1; }

mkdir -p "$BACKUP_DIR"

stamp="$(date -u '+%Y-%m-%d_%H%M')"
final="$BACKUP_DIR/fm-$stamp.sql.gz"
tmp="$final.partial"

# Clean up a partial file if we die part-way through.
trap 'rm -f "$tmp"' EXIT

cd "$PROJECT_DIR" || die "project dir not found: $PROJECT_DIR"

# ---------------------------------------------------------------------------
# Dump
# ---------------------------------------------------------------------------
# `set -o pipefail` is what makes this safe: without it the exit status would
# come from gzip, which happily succeeds on empty input.
log "starting dump of $DB_NAME"

docker compose -f "$COMPOSE_FILE" exec -T db \
  pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists \
  | gzip -9 > "$tmp" \
  || die "pg_dump failed (nothing was pruned)"

# ---------------------------------------------------------------------------
# Verify before trusting it
# ---------------------------------------------------------------------------
[ -s "$tmp" ] || die "dump is empty"

gzip -t "$tmp" || die "gzip archive is corrupt"

# Content check is the meaningful one: an error page or a truncated write will
# not carry pg_dump's header.
zgrep -q 'PostgreSQL database dump' "$tmp" || die "dump does not look like pg_dump output"

# Size is checked UNCOMPRESSED. SQL gzips by 10-20x, so a healthy dump of a
# small database can compress under a kilobyte — testing the compressed size
# would fail perfectly good backups.
size="$(zcat "$tmp" | wc -c)"
[ "$size" -ge "$MIN_BYTES" ] || die "dump suspiciously small (${size}B uncompressed < ${MIN_BYTES}B)"

# Atomic publish: readers never see a half-written backup.
mv "$tmp" "$final"
trap - EXIT

log "ok: $(basename "$final") (${size} bytes)"

# ---------------------------------------------------------------------------
# Prune — only now, and only if a good backup exists
# ---------------------------------------------------------------------------
if [ ! -s "$final" ]; then
  die "refusing to prune: no verified backup this run"
fi

deleted="$(find "$BACKUP_DIR" -name 'fm-*.sql.gz' -type f -mtime "+$RETENTION_DAYS" -print -delete | wc -l)"
[ "$deleted" -eq 0 ] || log "pruned $deleted backup(s) older than ${RETENTION_DAYS}d"

kept="$(find "$BACKUP_DIR" -name 'fm-*.sql.gz' -type f | wc -l)"
log "done: $kept backup(s) on disk"
