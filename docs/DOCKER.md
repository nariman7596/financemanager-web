# Running FinanceManager with Docker — the beginner's guide

This is the **maximum-isolation** setup, explained simply. You edit on your Mac
in VS Code; the VPS runs everything in sealed containers so projects can never
interfere with each other.

---

## The idea, in plain words

Think of your **VPS** (a computer you rent in the cloud) as an **apartment
building**:

- **Docker** lets you run each app inside a sealed **box** (a *container*). Boxes
  can't peek into each other — that's the isolation.
- An **image** is the *recipe* for a box; a **container** is a *running* box made
  from that recipe.
- A **volume** is a box's private *storage drawer* that survives restarts — your
  database's data lives here, so nothing is lost when you update the app.
- A **network** is the *hallway* boxes use to talk to each other.
- A **reverse proxy** (we use **Caddy**) is the building's **receptionist**: a
  visitor arrives at the front door (`finance.yourdomain.com`), the receptionist
  walks them to the right apartment, and hands out secure HTTPS badges
  automatically (free Let's Encrypt certificates).

Each **project** is one **apartment** = its own app box **and** its own database
box, on its own private hallway. One receptionist out front serves them all.

```
                 Internet
                    │  (https://finance.yourdomain.com)
             ┌──────▼───────┐
             │  Caddy (proxy)│   ← the receptionist, one per VPS
             └──────┬───────┘
        shared "web" network
                    │
   ┌────────────────▼─────────────────┐   ← FinanceManager "apartment"
   │  app box  ──private──  db box     │
   │  (Next.js)   network   (Postgres) │
   └───────────────────────────────────┘
   (another project would be its own separate apartment)
```

Everything below uses the files already in this repo: `Dockerfile`,
`docker-compose.yml` (app + its Postgres), `docker-compose.dev.yml` (local DB),
and `deploy/proxy/` (the receptionist).

---

## Part 1 — Your Mac (edit + run locally)

1. **Install** [Docker Desktop](https://www.docker.com/products/docker-desktop/)
   and [VS Code](https://code.visualstudio.com/). Handy VS Code extensions:
   *Docker* and *Prisma*.
2. **Get the code** and open it in VS Code:
   ```bash
   git clone https://github.com/nariman7596/financemanager-web.git
   cd financemanager-web
   code .
   ```
3. **Start a local database** (a Postgres box on your Mac):
   ```bash
   docker compose -f docker-compose.dev.yml up -d
   ```
4. **Configure + run the app** with hot-reload:
   ```bash
   cp .env.example .env        # DATABASE_URL already points at the local DB
   pnpm install
   pnpm db:push             # create the tables
   pnpm db:seed             # optional demo household + rates
   pnpm dev                 # http://localhost:3000
   ```
   Edit code in VS Code — the browser refreshes automatically.

> Want to test the *exact* production box on your Mac? Run the full stack:
> `cp .env.docker.example .env` (fill it in) then
> `docker network create web` and `docker compose up -d --build`.

When you're happy, commit and push — the VPS pulls the same code.

---

## Part 2 — The VPS, from scratch

Assumes a fresh **Ubuntu 24.04** server and a domain you can point at it.
Replace `finance.example.com` and passwords with your own.

### 2.1 Basic security

```bash
# as root
adduser --disabled-password --gecos "" fm && usermod -aG sudo fm
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

### 2.2 Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker fm        # let the fm user run docker
```

Log out and back in as `fm` so the group applies:

```bash
sudo -iu fm
docker run hello-world            # should print a success message
```

### 2.3 Create the shared front-door network (once)

```bash
docker network create web
```

### 2.4 Start the receptionist (Caddy)

Get the code and launch the proxy:

```bash
git clone https://github.com/nariman7596/financemanager-web.git
cd financemanager-web/deploy/proxy
nano Caddyfile        # change finance.example.com to YOUR domain
docker compose up -d
```

> The proxy is **one per server**. If you'll host several projects, copy
> `deploy/proxy` somewhere neutral (e.g. `/opt/proxy`) and add one block per
> project to its `Caddyfile`.

### 2.5 Point your domain at the server

In your DNS provider, add an **A record**: `finance.example.com → <VPS IP>`.
Wait a minute for it to propagate.

### 2.6 Deploy the app

```bash
cd ~/financemanager-web
cp .env.docker.example .env
nano .env                         # set DB_PASSWORD, AUTH_SECRET, CRON_SECRET
#   generate secrets with:  openssl rand -base64 32
docker compose up -d --build
```

What just happened: Docker built the app image, started a **private Postgres
box** and the **app box**, the app applied the database schema on startup and
joined the `web` network as `financemanager`, and Caddy began serving your domain
over HTTPS. Visit **https://finance.example.com** and register — you'll get your
own household as OWNER. 🎉

---

## Part 3 — Background jobs (already built in)

Nothing to set up — the stack includes a tiny **`cron` container** (see
`deploy/cron/`) that runs alongside the app and calls its scheduled endpoints
using `CRON_SECRET`:

- **price/FX refresh** — every hour
- **recurring auto-post** — once a day, ~06:00 UTC

It talks to the app privately over the `web` network, so nothing is exposed to
the internet. Watch it work:

```bash
docker compose logs -f cron
# cron: refreshed prices/FX at 2026-08-01T14:00:03Z
```

To change the schedule, edit `deploy/cron/tick.sh` and
`docker compose up -d --build cron`. (Prefer the host's crontab instead? You can
still `curl` the endpoints with the bearer token — but the container is simpler.)

---

## Part 4 — Everyday commands

Run these from `~/financemanager-web` on the VPS:

```bash
docker compose logs -f app          # watch app logs
docker compose ps                   # what's running
docker compose restart app          # restart just the app
docker compose down                 # stop this project (db data is kept in its volume)
docker compose up -d                # start it again
```

**Update to a new version:**
```bash
git pull
docker compose up -d --build        # rebuilds + restarts; schema auto-applies
```

**Back up the database (do this!):**
```bash
docker compose exec -T db pg_dump -U fm financemanager | gzip > ~/fm-$(date +%F).sql.gz
```
Restore: `gunzip -c backup.sql.gz | docker compose exec -T db psql -U fm financemanager`.

---

## Part 5 — Adding another project (the isolation payoff)

Each project is a self-contained apartment. To add "appb":

1. Put its code in its own folder (e.g. `~/appb`) with its **own**
   `docker-compose.yml` — its own Postgres box, its own volume, and a **unique**
   `web` alias:
   ```yaml
   services:
     app:
       networks:
         internal:
         web:
           aliases: [appb]        # ← unique per project
   networks:
     web: { external: true }
   ```
2. Add a block to the proxy's `Caddyfile` and reload it:
   ```
   appb.example.com { reverse_proxy appb:3000 }
   ```
   ```bash
   cd /opt/proxy && docker compose restart caddy   # or `up -d`
   ```

Now `finance.example.com` and `appb.example.com` are completely separate — own
app, own database, own storage. They share **only** the front-door network.

**Run one at a time** (to save resources): just stop one apartment and start the
other — Postgres data stays safe in each project's volume.
```bash
cd ~/financemanager-web && docker compose down
cd ~/appb           && docker compose up -d
```

---

## Cheat sheet

| I want to… | Command (in the project folder) |
| --- | --- |
| Start | `docker compose up -d` |
| Stop (keep data) | `docker compose down` |
| Rebuild after `git pull` | `docker compose up -d --build` |
| See logs | `docker compose logs -f app` |
| Back up DB | `docker compose exec -T db pg_dump -U fm financemanager \| gzip > backup.sql.gz` |
| Wipe DB too (careful) | `docker compose down -v` |

> Note: this repo's Docker files were written and reviewed but not build-tested
> in the authoring sandbox (no Docker there). The image simply wraps the
> already-verified `pnpm build`; if anything trips on first build, the logs
> (`docker compose logs -f`) will point right at it.
