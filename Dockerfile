# FinanceManager production image (multi-stage).
# Build:  docker build -t financemanager .
# It wraps `npm run build`; the container applies the DB schema on start then
# runs `next start` on port 3000. See docs/DOCKER.md.

# --- base: Node + the libs Prisma's engine needs ---
FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# --- deps: install everything (prisma CLI is needed at runtime for migrations) ---
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# --- build: generate the Prisma client + build Next ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# --- runner: the image that actually runs in production ---
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.mjs ./next.config.mjs
COPY --from=build /app/prisma ./prisma
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
