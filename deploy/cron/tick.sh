#!/bin/sh
# Tiny built-in scheduler (no cron daemon needed). Calls the app's cron
# endpoints over the internal `web` network, authenticated with CRON_SECRET:
#   - price/FX refresh    → once an hour (top of the hour)
#   - recurring auto-post  → once a day around 06:00 UTC
# Times are UTC. A failed call is retried on the next minute until it succeeds
# (handles the app still starting up).
set -eu
: "${CRON_SECRET:?CRON_SECRET not set}"

APP="http://financemanager:3000"
hit() { curl -fsS -H "Authorization: Bearer $CRON_SECRET" "$APP$1" >/dev/null 2>&1; }

last_hour=""
last_day=""
echo "cron: watching $APP  (refresh hourly, recurring daily ~06:00 UTC)"

while true; do
  hour=$(date -u +%Y%m%d%H)
  day=$(date -u +%Y%m%d)
  hh=$(date -u +%H)

  if [ "$hour" != "$last_hour" ]; then
    if hit /api/cron/refresh; then
      last_hour="$hour"
      echo "cron: refreshed prices/FX at $(date -u +%FT%TZ)"
    fi
  fi

  if [ "$hh" = "06" ] && [ "$day" != "$last_day" ]; then
    if hit /api/cron/recurring; then
      last_day="$day"
      echo "cron: posted recurring at $(date -u +%FT%TZ)"
    fi
  fi

  sleep 60
done
