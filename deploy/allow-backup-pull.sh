#!/usr/bin/env bash
#
# Let one SSH key download the backups — and do nothing else.
#
#   ./deploy/allow-backup-pull.sh 'ssh-ed25519 AAAA… fm-backup-pull'
#
# The key is added to root's authorized_keys behind a forced command that
# streams the finished backups as a tar archive — whatever the client asks to
# run, that is all it gets. Whoever holds the key can download the backups and
# cannot open a shell, run anything else, write a file, read any other file, or
# forward ports. That matters because the key lives unencrypted on the machine
# that pulls (a scheduled job cannot type a passphrase), and it logs in as root.
#
# (rrsync -ro was the first choice, but macOS now ships openrsync, whose server
# invocation rrsync rejects. A fixed tar needs nothing from the client's tools.)
#
# Safe to re-run: an existing line for the same key is replaced, not duplicated.
# See docs/BACKUP.md.

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
AUTH_KEYS="${AUTH_KEYS:-$HOME/.ssh/authorized_keys}"

die() { echo "ERROR: $*" >&2; exit 1; }

pubkey="${1:-}"
[ -n "$pubkey" ] || die "usage: $0 'ssh-ed25519 AAAA… comment'"
case "$pubkey" in
  ssh-ed25519\ *|ssh-rsa\ *|ecdsa-sha2-*) ;;
  *) die "that does not look like a public key (expected 'ssh-ed25519 AAAA…')" ;;
esac
# Just the type and the key material; drop any options or comment pasted along.
set -- $pubkey
key_type="$1"; key_body="${2:-}"
[ -n "$key_body" ] || die "public key is missing its key material"

[ -d "$BACKUP_DIR" ] || die "no backup directory at $BACKUP_DIR — set up deploy/backup.sh first"
BACKUP_DIR="$(cd "$BACKUP_DIR" && pwd)"

mkdir -p "$(dirname "$AUTH_KEYS")"
chmod 700 "$(dirname "$AUTH_KEYS")"
touch "$AUTH_KEYS"
chmod 600 "$AUTH_KEYS"

# Drop any earlier line for this key (e.g. the old rrsync form), then add it.
tmp="$(mktemp)"
grep -vF "$key_body" "$AUTH_KEYS" > "$tmp" || true
cat "$tmp" > "$AUTH_KEYS"
rm -f "$tmp"

# Only finished backups: a dump in progress is fm-*.sql.gz.partial.
printf 'command="cd %s && tar -cf - fm-*.sql.gz",restrict %s %s fm-backup-pull\n' \
  "$BACKUP_DIR" "$key_type" "$key_body" >> "$AUTH_KEYS"
echo "ok: that key can now download the backups in $BACKUP_DIR/ (read-only, nothing else)"
