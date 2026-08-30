# Deploying on a fresh VPS inside Iran

The other guides assume the server can pull a prebuilt image from GHCR. **From
an Iranian IP it cannot** — GitHub's container registry and Docker Hub both
refuse Iranian addresses. That single fact decides everything else here, so
read this before following `docs/DOCKER.md` or `docs/DEPLOY-PRIVATE.md`.

Everything else about the project works fine from Iran. It is only the image
pull that breaks.

---

## 0. Decide which path you are on

The whole "CI builds, the server only pulls" design exists because the original
VPS (1 vCPU / 961 MB) could not finish a Next.js build. From Iran you lose the
pull, so you have to get the image there some other way.

| | Path A — build on the server | Path B — build elsewhere, copy the image | Path C — give the server a proxy |
| --- | --- | --- | --- |
| Server RAM needed | **4 GB+** (or 2 GB + swap, slowly) | 1 GB is fine | 1 GB is fine |
| Needs Docker Hub on the server | yes (base image) | no | yes, through the proxy |
| Needs GHCR on the server | no | no | yes, through the proxy |
| Extra moving parts | none | a laptop with access + `scp` | a working outbound proxy |

**If your VPS has 4 GB or more, take Path A.** It is the fewest moving parts.
**If it is a small box, take Path B** — build on your Mac or laptop and copy
the result over. Path C is the nicest long term but only if you already have a
reliable outbound proxy on that machine.

Running the app is cheap either way — about **530 MB** for web + API +
Postgres. Only *building* is expensive.

---

## 1. Base server setup (all paths)

```bash
# as root on the fresh VPS
apt update && apt upgrade -y
apt install -y ca-certificates curl git ufw

# a non-root user to run things as
adduser --disabled-password --gecos "" fm
usermod -aG sudo fm

# firewall: SSH only. The app is NOT exposed — see step 6.
ufw allow OpenSSH
ufw --force enable

timedatectl set-timezone Asia/Tehran
```

Add swap if you have less than 4 GB. A Next.js build without it gets killed by
the OOM killer, and on the original server that took sshd down with it:

```bash
fallocate -l 4G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### Docker

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker fm
```

If `get.docker.com` is unreachable, install `docker.io` and
`docker-compose-plugin` from the Ubuntu repositories instead — a slightly older
Docker is fine here.

---

## 2. Getting past the registry block

### If you are on Path A or C: Docker Hub mirror

The Dockerfile's base image is `node:22-bookworm-slim` from Docker Hub. Point
Docker at a mirror your provider offers:

```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json >/dev/null <<'JSON'
{ "registry-mirrors": ["https://<mirror-your-provider-gives-you>"] }
JSON
sudo systemctl restart docker
docker pull node:22-bookworm-slim   # must succeed before you go further
```

> Ask your VPS provider for their current mirror endpoint rather than trusting
> a hostname from a blog post. The Iranian Docker mirrors have come and gone
> repeatedly, and a dead one fails in a way that looks like a network problem.

### If you are on Path C: proxy the Docker daemon

```bash
sudo mkdir -p /etc/systemd/system/docker.service.d
sudo tee /etc/systemd/system/docker.service.d/proxy.conf >/dev/null <<'CONF'
[Service]
Environment="HTTP_PROXY=http://127.0.0.1:PORT"
Environment="HTTPS_PROXY=http://127.0.0.1:PORT"
Environment="NO_PROXY=localhost,127.0.0.1"
CONF
sudo systemctl daemon-reload && sudo systemctl restart docker
```

That proxy has to be an **outbound** client on this machine. An Xray/Reality
server listening for your phone is not one — it accepts connections, it does
not make them. You need a client outbound (Xray in client mode, or an SSH
`-D` tunnel to a machine abroad) with a local HTTP/SOCKS port.

### npm registry

`registry.npmjs.org` is usually reachable from Iran but can be slow or flaky.
If installs stall, point pnpm at a mirror for the build only:

```bash
pnpm config set registry https://<npm-mirror>
```

---

## 3. Get the code

```bash
su - fm
git clone https://github.com/nariman7596/financemanager-web.git
cd financemanager-web
```

**Which branch?** On a *fresh* server the database is empty, so the migration
that normally needs a backup first has nothing to lose. Deploy the full branch
and get the API, encryption and sync as well:

```bash
git checkout claude/personal-finance-app-9s8mrr
```

(If you would rather start with only the web app, stay on `main`. You can move
to the branch later — but from then on the backup rule in step 7 applies,
because by then the database has your data in it.)

---

## 4. Secrets

```bash
cp .env.docker.example .env
nano .env
```

Fill in, each from `openssl rand -base64 32`:

```
DB_PASSWORD=...
AUTH_SECRET=...
CRON_SECRET=...
TOKEN_ENCRYPTION_KEY=...
COOKIE_SECURE=false        # see step 6
```

> ⚠️ **`TOKEN_ENCRYPTION_KEY` is not in the database.** It encrypts transaction
> descriptions, notes and bank messages. A database backup does **not** contain
> it, and losing it loses those fields permanently — the amounts and dates
> survive, the text does not. Put it in a password manager *now*, before you
> enter any real data. See `docs/ENCRYPTION.md`.

---

## 5. Build and start

### Path A — build on the server

```bash
docker compose -f docker-compose.private.yml up -d --build
```

First build takes 10–25 minutes on a small box. Watch it rather than walking
away — if it dies silently, that is the OOM killer and you need more swap.

### Path B — build on your laptop, copy the image over

On a machine with working access (your Mac):

```bash
git clone https://github.com/nariman7596/financemanager-web.git
cd financemanager-web && git checkout claude/personal-finance-app-9s8mrr

docker build --target runner     -t fm-web:latest .
docker build --target api-runner -t fm-api:latest .

docker save fm-web:latest fm-api:latest | gzip > fm-images.tar.gz
scp fm-images.tar.gz fm@YOUR_SERVER:~/
```

The `--target` flags matter: without one, Docker builds the **last** stage in
the Dockerfile, and you would get the API in both images.

On the server:

```bash
gunzip -c ~/fm-images.tar.gz | docker load
```

Then point the services at the loaded images. Compose uses an image when one
is already present locally, so naming them is enough:

```bash
cat > ~/financemanager-web/docker-compose.override.yml <<'YAML'
services:
  app:
    image: fm-web:latest
  api:
    image: fm-api:latest
YAML
cd ~/financemanager-web
docker compose -f docker-compose.private.yml up -d --no-build
```

`--no-build` is the belt and braces: it makes compose fail loudly if it ever
decides it wants to build, instead of quietly starting a 20-minute build on a
server that cannot finish one.

You still need `postgres:16-alpine`, which is also on Docker Hub — either use a
mirror (step 2) or include it in the tarball:
`docker pull postgres:16-alpine && docker save postgres:16-alpine | gzip > pg.tar.gz`.

### Check it came up

```bash
docker compose -f docker-compose.private.yml ps
docker compose -f docker-compose.private.yml logs -f app | head -40
```

You are looking for `Applying database schema…` followed by
`Starting FinanceManager on :3000`. The app container applies the migrations on
start, so the schema creates itself.

Seed the demo data if you want something to look at:

```bash
docker compose -f docker-compose.private.yml exec app \
  sh -c 'cd /app/packages/db && ./node_modules/.bin/tsx prisma/seed.ts'
```

---

## 6. Reaching the app

The compose file binds to `127.0.0.1:3000` deliberately — the port does not
exist on the public interface. Note that Docker publishes ports *past* ufw (it
writes its own iptables chain), so that `127.0.0.1:` prefix is the only thing
actually keeping it closed.

**Start with an SSH tunnel.** No domain, no certificate, nothing exposed:

```bash
# from your laptop
ssh -N -L 3000:127.0.0.1:3000 fm@YOUR_SERVER
# then open http://localhost:3000
```

`http://localhost` counts as a secure context, so session cookies work over the
tunnel even with `COOKIE_SECURE=false`.

For your phone, the same tunnel works through any SSH client app, or set up
WireGuard and put `APP_BIND=10.66.66.1` in `.env` — a peer arriving on `wg0`
cannot reach a socket bound to loopback.

If you later want a real domain with HTTPS, `docs/DOCKER.md` covers Caddy, and
`docs/DEPLOY-BEHIND-XRAY.md` covers the case where a VPN already holds port
443. Be aware that a public hostname pointing at an Iranian IP puts the name in
the Certificate Transparency logs, which is the opposite of the private posture
this deployment was designed around.

---

## 7. Backups

```bash
crontab -e
# 0 3 * * * /home/fm/financemanager-web/deploy/backup.sh
```

`deploy/backup.sh` verifies each dump before pruning old ones, because the
obvious one-liner deletes good backups when `pg_dump` fails. Test the restore
once, now, while nothing matters: `deploy/restore.sh`.

**And back up `TOKEN_ENCRYPTION_KEY` somewhere that is not this server.** It is
the one thing a database backup cannot give you back.

---

## 8. Updating later

Path A:

```bash
cd ~/financemanager-web && git pull
docker compose -f docker-compose.private.yml up -d --build
```

Path B: rebuild and re-copy the images, then `up -d`.

Either way, take a backup first once you have real data — the container applies
migrations on start, so an update can change the schema.

---

## Things that will waste your time if you do not know them

- **A failed build leaves the old container running.** The app keeps serving the
  previous version and nothing announces the failure. Always read the build
  output to the end.
- **`docker compose build` with no `--target` builds the API.** The compose
  files in this repo now pin it; if you write your own, do not forget it.
- **The OOM killer is silent.** A build that "hangs" then dies on a small box is
  almost always memory. `dmesg | tail` will show it.
- **Postgres data lives in a Docker volume**, not in the repo directory. `git
  pull` and rebuilds do not touch it; `docker compose down -v` destroys it.
