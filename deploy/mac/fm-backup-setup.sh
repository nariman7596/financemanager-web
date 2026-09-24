#!/bin/bash
#
# Copy the server's nightly backups to this Mac, every day, automatically.
#
#   bash fm-backup-setup.sh
#
# A backup that lives only on the server it protects is lost with that server.
# This sets up a daily job (launchd) that pulls every backup into ~/fm-backups
# and keeps them — also the ones the server has already pruned — and shows a
# macOS notification only when something is really wrong: the server has been
# unreachable for three days, or its newest backup is stale or corrupt.
#
# It logs in with its own SSH key, which the server limits to reading the
# backup files (deploy/allow-backup-pull.sh). Safe to re-run.
#
# Written for the stock macOS bash 3.2 — no bash 4 features.

set -euo pipefail

HOST="${FM_BACKUP_HOST:-root@216.126.229.4}"
DEST="$HOME/fm-backups"
KEY="$HOME/.ssh/fm_backup_pull"
BIN_DIR="$HOME/Library/Application Support/FinanceManager"
PULL="$BIN_DIR/pull-backups.sh"
LABEL="app.financemanager.pull-backups"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

mkdir -p "$DEST" "$BIN_DIR" "$HOME/.ssh" "$HOME/Library/LaunchAgents"
chmod 700 "$HOME/.ssh"

# ---------------------------------------------------------------------------
# 1. A key of its own. No passphrase: a scheduled job cannot type one. The
#    server is what makes that acceptable — it lets this key read backups and
#    nothing else.
# ---------------------------------------------------------------------------
if [ ! -f "$KEY" ]; then
  ssh-keygen -q -t ed25519 -N "" -C "fm-backup-pull" -f "$KEY"
fi

echo
echo "Step 1 of 2 — on the SERVER, run this one line:"
echo
echo "  cd ~/financemanager-web && git pull -q && bash deploy/allow-backup-pull.sh '$(cat "$KEY.pub")'"
echo
printf "When it printed \"ok\", press Enter here… "
read -r _

# ---------------------------------------------------------------------------
# 2. The daily job.
# ---------------------------------------------------------------------------
cat > "$PULL" <<'EOF'
#!/bin/bash
# Pull FinanceManager backups from the server. Installed by fm-backup-setup.sh,
# run daily by launchd (app.financemanager.pull-backups).
set -uo pipefail

HOST="${FM_BACKUP_HOST:-root@216.126.229.4}"
KEY="$HOME/.ssh/fm_backup_pull"
DEST="$HOME/fm-backups"
LOG="$DEST/pull.log"
LAST_OK="$DEST/.last-ok"

mkdir -p "$DEST/server"
log() { echo "$(date '+%Y-%m-%d %H:%M:%S')  $*" >> "$LOG"; }
notify() {
  /usr/bin/osascript -e "display notification \"$1\" with title \"FinanceManager backup\"" \
    >/dev/null 2>&1 || true
}

# The server answers this key with a tar of its backups, whatever command is
# asked for (deploy/allow-backup-pull.sh), so there is nothing to choose here.
# Files already on the Mac are simply rewritten with the same content.
# Nothing is ever deleted: the Mac keeps what the server prunes after 14 days.
if ! out="$( { /usr/bin/ssh -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes \
      -o ConnectTimeout=20 -o StrictHostKeyChecking=accept-new "$HOST" backups \
    | /usr/bin/tar -xf - -C "$DEST/server"; } 2>&1)"; then
  log "pull failed: $out"
  # A day or two away from home (the server is reached through the home VPN)
  # is normal. Only speak up once it has lasted.
  if [ ! -e "$LAST_OK" ] || [ -n "$(find "$LAST_OK" -mtime +2)" ]; then
    notify "3 روز است به سرور نرسیده‌ام؛ بکاپ‌ها کپی نمی‌شوند."
  fi
  exit 1
fi
touch "$LAST_OK"

# Reaching the server is not enough — check what arrived.
newest="$(ls -t "$DEST"/server/fm-*.sql.gz 2>/dev/null | head -1)"
if [ -z "$newest" ]; then
  log "no backups on the server"
  notify "روی سرور هیچ بکاپی نیست."
  exit 1
fi
if ! gzip -t "$newest" 2>/dev/null; then
  log "corrupt: $(basename "$newest")"
  notify "آخرین بکاپ خراب است: $(basename "$newest")"
  exit 1
fi
if [ -n "$(find "$newest" -mtime +2)" ]; then
  log "stale: newest is $(basename "$newest")"
  notify "آخرین بکاپِ سرور بیش از ۲ روز پیش است؛ بکاپِ شبانه‌ی سرور متوقف شده."
  exit 1
fi

count="$(ls "$DEST"/server/fm-*.sql.gz | wc -l | tr -d ' ')"
log "ok: $count backup(s), newest $(basename "$newest")"
EOF
chmod 755 "$PULL"

echo
echo "Testing the connection…"
if ! "$PULL"; then
  echo
  echo "The first pull failed. Last lines of $DEST/pull.log:"
  tail -3 "$DEST/pull.log" 2>/dev/null || true
  echo
  echo "Fix that (usually: step 1 was not run, or you are not on the home network)"
  echo "and run this script again. Nothing was scheduled."
  exit 1
fi
tail -1 "$DEST/pull.log"

# ---------------------------------------------------------------------------
# 3. Schedule it: every day at 09:00. If the Mac is asleep then, launchd runs
#    it when it wakes.
# ---------------------------------------------------------------------------
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$PULL</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>9</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
  <key>StandardOutPath</key><string>$DEST/launchd.log</string>
  <key>StandardErrorPath</key><string>$DEST/launchd.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo
echo "Done. Backups are in $DEST/server and are refreshed every day at 09:00."
echo "Log: $DEST/pull.log"
