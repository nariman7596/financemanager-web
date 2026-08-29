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

# --- deps: install the whole workspace (the Prisma CLI is needed at runtime) ---
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json ./apps/web/
COPY packages/config/package.json ./packages/config/
# `corepack install` (no arguments) reads the exact pnpm version out of
# package.json's `packageManager` field and materialises it in the image, so
# the version is pinned in exactly one place and the build never silently
# resolves a different one.
RUN corepack enable && corepack install
RUN pnpm install --frozen-lockfile

# --- build: generate the Prisma client + build Next ---
FROM base AS build
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .
RUN corepack install && pnpm --filter @financemanager/web build

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
