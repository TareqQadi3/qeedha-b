# Milestone 2 "Docker": production-oriented multi-stage build for the
# NestJS API only - no database in this image (see docker-compose.yml /
# docs/DEPLOYMENT.md). node:20-slim (Debian/glibc) is used instead of an
# alpine base deliberately: this project depends on argon2 (native module)
# and Prisma's query engine, both of which ship prebuilt binaries for glibc
# but not reliably for musl/alpine without extra build tooling - slim avoids
# that risk without meaningfully increasing image size for an API service.
#
# NOTE: prepared but not verified with `docker build` in the development
# sandbox this was written in (no Docker daemon access there) - see
# docs/DEPLOYMENT.md "Known limitations" before relying on it unverified.

# ---- deps: full node_modules (incl. devDependencies) for build + prisma generate ----
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate

# ---- build: compile TypeScript ----
FROM node:20-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY . .
RUN npm run build

# ---- prod-deps: production-only node_modules (smaller final image) ----
FROM node:20-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate

# ---- runtime: only what's needed to run the compiled app ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd -r qeedha && useradd -r -g qeedha qeedha
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./

# Excel Import uploads (STORAGE_LOCAL_DIR, default ./storage-data - see
# docs/DEPLOYMENT.md "Storage") - pre-created and owned by the non-root
# runtime user so a persistent volume mounted here (docker-compose.yml)
# is writable. Without this, Docker creates the mount point as root and
# the app (running as `qeedha` below) would fail to write into it.
RUN mkdir -p /app/storage-data && chown -R qeedha:qeedha /app/storage-data

USER qeedha
EXPOSE 3000

# Migrations are NOT run automatically on container start - see
# docs/DEPLOYMENT.md "Migrations": run `prisma migrate deploy` as a separate,
# explicit step before starting new containers, never implicitly on boot.
CMD ["node", "dist/main"]
