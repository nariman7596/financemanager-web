#!/usr/bin/env bash
#
# Let one SSH key download the backups — and do nothing else.
#
#   ./deploy/allow-backup-pull.sh 'ssh-ed25519 AAAA… fm-backup-pull'
#
# The key is added to root's authorized_keys behind a forced command:
# `rrsync -ro <backup dir>`. Whoever holds it can rsync files *out of* the
# backup directory and cannot open a shell, run a command, write a file, read
# anything outside that directory, or forward ports. That matters because the
# key lives unencrypted on the machine that pulls (a scheduled job cannot type
# a passphrase), and it is root that it logs in as.
#
# Safe to re-run: the same key is not added twice. See docs/BACKUP.md.

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

# rrsync ships with rsync (in /usr/bin on Debian 12+ / Ubuntu 22.04+; older
# releases keep it among the docs, sometimes gzipped).
if ! command -v rsync >/dev/null; then
  echo "installing rsync…"
  apt-get install -y -q rsync >/dev/null
fi
rrsync="$(command -v rrsync || true)"
if [ -z "$rrsync" ]; then
  for f in /usr/share/doc/rsync/scripts/rrsync /usr/share/doc/rsync/scripts/rrsync.gz; do
    [ -f "$f" ] || continue
    case "$f" in *.gz) zcat "$f" > /usr/local/bin/rrsync ;; *) cp "$f" /usr/local/bin/rrsync ;; esac
    chmod 755 /usr/local/bin/rrsync
    rrsync=/usr/local/bin/rrsync
    break
  done
fi
[ -n "$rrsync" ] || die "rrsync not found; install a newer rsync package"

[ -d "$BACKUP_DIR" ] || die "no backup directory at $BACKUP_DIR — set up deploy/backup.sh first"
BACKUP_DIR="$(cd "$BACKUP_DIR" && pwd)"

mkdir -p "$(dirname "$AUTH_KEYS")"
chmod 700 "$(dirname "$AUTH_KEYS")"
touch "$AUTH_KEYS"
chmod 600 "$AUTH_KEYS"

if grep -qF "$key_body" "$AUTH_KEYS"; then
  echo "that key is already in $AUTH_KEYS — nothing changed"
  exit 0
fi

printf 'command="%s -ro %s/",restrict %s %s fm-backup-pull\n' \
  "$rrsync" "$BACKUP_DIR" "$key_type" "$key_body" >> "$AUTH_KEYS"
echo "ok: that key can now download $BACKUP_DIR/ (read-only, nothing else)"
