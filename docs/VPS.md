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

## 5. Point Prisma at PostgreSQL

Edit `prisma/schema.prisma` — replace the `datasource db { … }` block with
(single local DB needs no pooling / directUrl):

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

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
