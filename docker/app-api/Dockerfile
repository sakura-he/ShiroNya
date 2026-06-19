# syntax=docker/dockerfile:1.7
# Deploy via GHA -> GHCR pull (app-api independent runtime)

ARG CERBOS_VERSION=0.53.0

FROM ghcr.io/cerbos/cerbos:${CERBOS_VERSION} AS cerbos-cli

FROM node:22-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@9.15.2 --activate

WORKDIR /app

# ---------------------------------------------------------------------------
# deps: resolve full (dev+prod) node_modules. Cached as long as workspace
# manifests and the lockfile don't change, so source-only edits skip install.
# ---------------------------------------------------------------------------
FROM base AS deps

COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/app-api/package.json ./apps/app-api/package.json
COPY apps/admin-api/package.json ./apps/admin-api/package.json
COPY apps/admin-web/package.json ./apps/admin-web/package.json
COPY packages/spicedb-toolkit/core/package.json ./packages/spicedb-toolkit/core/package.json
COPY packages/spicedb-toolkit/nestjs/package.json ./packages/spicedb-toolkit/nestjs/package.json

RUN --mount=type=cache,id=app-api-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store

# ---------------------------------------------------------------------------
# builder: compile app-api + spicedb-toolkit on top of the cached deps.
# ---------------------------------------------------------------------------
FROM deps AS builder

COPY tsconfig.json tsconfig.build.json tsconfig.app-api-paths.json nest-cli.json webpack.config.cjs webpack-hmr.config.cjs ./
COPY prisma.app.config.ts spicedb.app-api.config.ts zod-generator.config.json global.d.ts ./
COPY prisma ./prisma
COPY apps/app-api ./apps/app-api
COPY libs ./libs
COPY packages ./packages
COPY proto ./proto
COPY spicedb ./spicedb
COPY static ./static

ENV NODE_ENV=production
ENV APP_DATABASE_URL=postgresql://prisma:prisma@localhost:5432/prisma

RUN pnpm prisma:app:generate \
    && pnpm --filter @spicedb-toolkit/core build \
    && pnpm --filter @spicedb-toolkit/nestjs build \
    && pnpm build:app-api

# ---------------------------------------------------------------------------
# prod-deps: reinstall with --prod so runtime image ships only runtime deps.
# Workspace packages (@spicedb-toolkit/*) get their own node_modules here.
# ---------------------------------------------------------------------------
FROM base AS prod-deps

# Use app-api's package manifest as the temporary root manifest. Installing
# from the monorepo root package would pull unrelated app dependencies into the
# backend runtime image.
COPY .npmrc pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/app-api/package.json ./package.json
COPY packages/spicedb-toolkit/core/package.json ./packages/spicedb-toolkit/core/package.json
COPY packages/spicedb-toolkit/nestjs/package.json ./packages/spicedb-toolkit/nestjs/package.json

ENV NODE_ENV=production

RUN --mount=type=cache,id=app-api-pnpm-store,target=/pnpm/store \
    pnpm install --prod --no-frozen-lockfile --ignore-scripts --store-dir /pnpm/store

# ---------------------------------------------------------------------------
# runner: minimal runtime image. gRPC private certs are mounted by compose.
# ---------------------------------------------------------------------------
FROM base AS runner

ENV NODE_ENV=production
ENV CERBOS_NO_TELEMETRY=1

WORKDIR /app

COPY --from=cerbos-cli /cerbos /usr/local/bin/cerbos
COPY .env ./.env
COPY .env.production ./.env.production
COPY --from=prod-deps /app/package.json ./package.json
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/libs/prisma-app/src/generated ./libs/prisma-app/src/generated
COPY --from=builder /app/packages/spicedb-toolkit/core/package.json ./packages/spicedb-toolkit/core/package.json
COPY --from=builder /app/packages/spicedb-toolkit/core/dist ./packages/spicedb-toolkit/core/dist
COPY --from=prod-deps /app/packages/spicedb-toolkit/core/node_modules ./packages/spicedb-toolkit/core/node_modules
COPY --from=builder /app/packages/spicedb-toolkit/nestjs/package.json ./packages/spicedb-toolkit/nestjs/package.json
COPY --from=builder /app/packages/spicedb-toolkit/nestjs/dist ./packages/spicedb-toolkit/nestjs/dist
COPY --from=prod-deps /app/packages/spicedb-toolkit/nestjs/node_modules ./packages/spicedb-toolkit/nestjs/node_modules
COPY --from=builder /app/spicedb.app-api.config.ts ./spicedb.app-api.config.ts
COPY --from=builder /app/proto ./proto
COPY --from=builder /app/spicedb ./spicedb
COPY --from=builder /app/static ./static

RUN mkdir -p /app/logs /app/static /app/uploads /app/chunks /app/merge /app/certs/app-user-admin-grpc

EXPOSE 3001 50051

CMD ["node", "dist/apps/app-api/main.js"]
