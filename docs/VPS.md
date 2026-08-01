# Self-hosting FinanceManager on an Ubuntu 24.04 VPS

A from-scratch, copy-paste setup: PostgreSQL + Node 22 + the app under systemd,
behind Caddy (automatic HTTPS), with system cron driving the background jobs.

Assumes a fresh Ubuntu 24.04 server and a domain you can point at it. Replace
`example.com`, the DB password, and secrets with your own.

---

## 1. Server basics

SSH in as root (or a sudo user) and create a dedicated app user + firewall:

```bash
apt update && apt -y upgrade
adduser --disabled-password --gecos "" fm      # app user (no password login)
usermod -aG sudo fm

ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable
```

## 2. Install Node 22 + git + build tools

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
apt install -y nodejs git build-essential
node -v      # v22.x
```

## 3. Install PostgreSQL 16 and create the database

```bash
apt install -y postgresql postgresql-contrib
sudo -u postgres psql <<'SQL'
CREATE USER fm WITH ENCRYPTED PASSWORD 'CHANGE_ME_STRONG';
CREATE DATABASE financemanager OWNER fm;
SQL
```

Making `fm` the **owner** avoids the PG15+ `public` schema permission pitfalls.
Your connection string will be:

```
postgresql://fm:CHANGE_ME_STRONG@localhost:5432/financemanager?schema=public
```

## 4. Get the code

```bash
sudo -iu fm            # become the app user
git clone https://github.com/nariman7596/financemanager.git
cd financemanager
npm ci
```

## 5. Prisma is already on PostgreSQL

`prisma/schema.prisma` ships with `provider = "postgresql"` — nothing to change.
`DATABASE_URL` (next step) points it at your local Postgres.

## 6. Environment file

```bash
cp .env.example .env
nano .env
```

Set:

```ini
DATABASE_URL="postgresql://fm:CHANGE_ME_STRONG@localhost:5432/financemanager?schema=public"
AUTH_SECRET="PASTE_openssl_rand_base64_32"
CRON_SECRET="PASTE_another_openssl_rand_base64_32"
# optional: STOCK_API_KEY="your-finnhub-key"
```

Generate the secrets:

```bash
openssl rand -base64 32   # AUTH_SECRET
openssl rand -base64 32   # CRON_SECRET
```

## 7. Create the schema + build

For a single self-hosted environment, `db push` is the simplest (no migration
files to manage):

```bash
npm run db:push          # creates all tables in Postgres
npm run db:seed          # OPTIONAL: demo household + exchange rates
npm run build            # production build
```

Quick smoke test before wiring up services:

```bash
npm start &              # starts on http://localhost:3000
curl -I http://localhost:3000/login    # expect HTTP 200
kill %1
```

## 8. Run it under systemd

As root (exit the `fm` shell or use `sudo`), create the service:

```bash
sudo tee /etc/systemd/system/financemanager.service >/dev/null <<'UNIT'
[Unit]
Description=FinanceManager
After=network.target postgresql.service

[Service]
Type=simple
User=fm
WorkingDirectory=/home/fm/financemanager
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now financemanager
sudo systemctl status financemanager      # should be active (running)
```

The app reads `AUTH_SECRET`, `CRON_SECRET`, etc. from `.env` automatically
(Next.js loads it at runtime). It listens on `localhost:3000`.

## 9. Reverse proxy + HTTPS (Caddy)

Caddy gets you automatic Let's Encrypt TLS in three lines. First point your
domain's **A record** at the server's IP, then:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

sudo tee /etc/caddy/Caddyfile >/dev/null <<'CADDY'
example.com {
    reverse_proxy localhost:3000
}
CADDY

sudo systemctl reload caddy
```

Visit `https://example.com` — you should see the login page over HTTPS.

> Prefer Nginx? Install `nginx` + `certbot python3-certbot-nginx`, proxy_pass to
> `http://localhost:3000`, then `sudo certbot --nginx -d example.com`.

## 10. Scheduled jobs (system cron)

The two background endpoints are guarded by `CRON_SECRET`. Hit them on localhost
(no need to go back out through the proxy). Edit the `fm` user's crontab:

```bash
sudo -u fm crontab -e
```

Add (use your real `CRON_SECRET`):

```cron
# post due recurring transactions — daily at 06:00
0 6 * * * curl -fsS -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/recurring >/dev/null
# refresh FX + investment prices — hourly
0 * * * * curl -fsS -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/refresh >/dev/null
```

Verify once manually:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/refresh
# -> {"ok":true,"fx":{...},"prices":{...}}
```

## 11. You're live

Open `https://example.com`, register your account (you get your own household as
OWNER), and start adding accounts and transactions.

---

## Running several projects on one VPS

One Postgres server and one Caddy can host many apps side by side — the trick is
to give **each project its own isolated slice** of every shared resource. Nothing
in this app is hard-coded to a port or DB name, so isolation is pure convention:

| Resource | This app | Another project |
| --- | --- | --- |
| Linux user | `fm` | `projb` (own user = filesystem/process isolation) |
| Directory | `/home/fm/financemanager` | `/home/projb/appb` |
| Port | `3000` | `3001` (set via `Environment=PORT=` in its unit) |
| Postgres DB + role | `financemanager` / `fm` | `appb` / `projb` |
| systemd unit | `financemanager.service` | `appb.service` |
| Caddy site block | `finance.example.com → :3000` | `appb.example.com → :3001` |
| `.env` | its own | its own |
| Cron | `fm` crontab | `projb` crontab |

Each app **binds a different port** and points `DATABASE_URL` at **its own
database**. Postgres runs continuously and serves all of them — separate
databases never collide. Caddy holds one site block per project:

```
finance.example.com { reverse_proxy localhost:3000 }
appb.example.com    { reverse_proxy localhost:3001 }
```

### Running one at a time

Because each app is its own systemd service, you just stop one and start another
(and cron for a stopped app harmlessly fails, so pause it too):

```bash
sudo systemctl stop financemanager
sudo systemctl start appb
```

To keep only one running across reboots, `systemctl disable` the idle ones and
`enable` the active one. A tiny switch helper:

```bash
sudo tee /usr/local/bin/switch-project >/dev/null <<'SH'
#!/usr/bin/env bash
# usage: switch-project appb   → stops all known apps, starts the named one
APPS="financemanager appb"
for a in $APPS; do sudo systemctl stop "$a" 2>/dev/null; done
sudo systemctl start "$1" && echo "running: $1"
SH
sudo chmod +x /usr/local/bin/switch-project
```

> They can also run **simultaneously** if the VPS has the RAM (`next start` is
> ~150 MB each) — distinct ports mean no conflict. "One at a time" is only about
> saving resources, not correctness.

### Stronger isolation with Docker (optional)

If projects have conflicting stacks (different Node/Postgres versions) or you
want bulletproof separation, give each its own `docker-compose.yml` (app + its
own Postgres container) on a unique published port, and point host Caddy at that
port. Then one-at-a-time is just `docker compose up -d` / `docker compose down`
per project — no shared Node, no shared Postgres, nothing to collide.

## Updating to a new version

```bash
sudo -iu fm
cd financemanager
git pull
npm ci
npm run db:push        # only if the schema changed
npm run build
exit
sudo systemctl restart financemanager
```

## Backups (do this!)

Nightly Postgres dump, kept 14 days:

```bash
sudo -u fm crontab -e
# add:
30 3 * * * pg_dump "postgresql://fm:CHANGE_ME_STRONG@localhost:5432/financemanager" | gzip > /home/fm/backups/fm-$(date +\%F).sql.gz && find /home/fm/backups -name '*.sql.gz' -mtime +14 -delete
```

```bash
mkdir -p /home/fm/backups     # as the fm user
```

Restore: `gunzip -c backup.sql.gz | psql "postgresql://fm:…@localhost:5432/financemanager"`.

## Troubleshooting

- **Logs:** `sudo journalctl -u financemanager -f` (app), `sudo journalctl -u caddy -f` (proxy).
- **502 from Caddy:** the app isn't up — `systemctl status financemanager`.
- **DB auth failed:** re-check `DATABASE_URL` in `.env` matches the role/password.
- **Prices don't refresh:** confirm the VPS has outbound HTTPS to
  `open.er-api.com` / `api.coingecko.com`; stock prices need `STOCK_API_KEY`.
- **Env changes not picked up:** `sudo systemctl restart financemanager`.
