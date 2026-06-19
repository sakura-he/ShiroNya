# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable \
    && corepack prepare pnpm@9.15.2 --activate

WORKDIR /app

FROM base AS deps

COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/admin-web/package.json ./apps/admin-web/package.json
COPY packages/spicedb-toolkit/core/package.json ./packages/spicedb-toolkit/core/package.json
COPY packages/spicedb-toolkit/nestjs/package.json ./packages/spicedb-toolkit/nestjs/package.json
COPY packages/spicedb-toolkit/cli/package.json ./packages/spicedb-toolkit/cli/package.json

RUN --mount=type=cache,id=admin-web-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter ./apps/admin-web... --store-dir /pnpm/store

FROM deps AS builder

ARG VITE_API_BASE_URL

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

COPY apps/admin-web ./apps/admin-web

RUN test -n "$VITE_API_BASE_URL" \
    && pnpm --filter ./apps/admin-web build

FROM nginx:1.27-alpine AS runner

COPY docker/admin-web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/admin-web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=5 --start-period=10s \
    CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
