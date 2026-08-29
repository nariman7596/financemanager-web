# FinanceManager production image (multi-stage).
#
# Build:  docker build -t financemanager .
# The container applies the DB schema on start, then runs `next start` on 3000.
# See docs/DOCKER.md.
#
# This is a pnpm/Turborepo workspace (ARCHITECTURE.md §2), so the install step
# needs every workspace manifest before any source. Copying the manifests
# first is what keeps the dependency layer cached across source-only commits —
# without it every push reinstalls from scratch, and CI build time is what
# gates deploys here (the VPS cannot build; it only pulls).

# --- base: Node + the libs Prisma's engine needs ---
FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# --- deps: warm the pnpm store straight from the lockfile ---
#
# `pnpm fetch` reads ONLY pnpm-lock.yaml, so this layer never has to enumerate
# the workspace's package.json files. That enumeration is exactly what broke
# the build once: two packages were added in a later commit, the COPY list was
# not updated, pnpm installed "all 3 workspace projects" instead of 5, and the
# missing workspace symlinks surfaced as "Can't resolve @financemanager/i18n".
# Adding a package must never again require editing this file.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
# `corepack install` (no arguments) reads the exact pnpm version out of
# package.json's `packageManager` field, so the version is pinned in one place
# and the build never silently resolves a different one.
RUN corepack enable && corepack install
RUN pnpm fetch

# --- build: install offline from the warmed store, then build ---
# Inherits the store from `deps`, so this install needs no network at all.
FROM deps AS build
COPY . .
# `pnpm fetch` leaves a modules directory behind, and the install below wants
# to purge it before recreating it. That prompt cannot be answered in a
# `docker build` (no TTY) and pnpm aborts rather than guessing, so the purge is
# confirmed up front. Verified by rehearsing these exact commands outside
# Docker, where the same abort reproduces.
RUN pnpm install --frozen-lockfile --offline --config.confirmModulesPurge=false
RUN pnpm --filter @financemanager/web build
RUN pnpm --filter @financemanager/api build

# --- runner: the image that actually runs in production ---
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
# The whole tree is copied rather than cherry-picked files: pnpm's node_modules
# is a tree of relative symlinks into the root .pnpm store, so copying only
# apps/web/node_modules would leave every one of them dangling.
COPY --from=build /app /app
WORKDIR /app/apps/web
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh
EXPOSE 3000
# NOTE: there is deliberately no pnpm in this stage. `corepack enable` only
# installs shims — the real package-manager binary is fetched from the network
# on first use, which in a runner stage means every container start would
# depend on reaching the npm registry. The entrypoint calls the local binaries
# directly instead, so the container starts fine on an offline box.
ENTRYPOINT ["/app/docker-entrypoint.sh"]

# --- api-runner: the NestJS transport the mobile client talks to ---
#
# A separate image from the web one, built from the same tree. They are
# deployed as two containers so the API can be restarted, scaled or rolled back
# without touching the web app -- and so a crash in one does not take the other
# down on a box with no headroom to spare.
#
# Deliberately does NOT apply migrations: the web container's entrypoint owns
# that. Two containers racing `migrate deploy` on the same database at startup
# is a good way to find out what a half-applied migration looks like.
FROM base AS api-runner
ENV NODE_ENV=production
ENV API_PORT=3001
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/apps/api/src/main.js"]
