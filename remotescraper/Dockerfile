# syntax=docker/dockerfile:1.7
# Remote scraper image. Build context is the REPOSITORY ROOT, not
# ./remotescraper, because this is a pnpm workspace (package name:
# stealth-scraper) and the root workspace definition and lockfile are required
# to resolve dependencies.
#
#   docker build -f remotescraper/Dockerfile .
#
# Self-contained: TypeScript is compiled here rather than copying a developer's
# dist/ directory, so a clean checkout is all CI needs.

# --- build stage -----------------------------------------------------------
# Runs on the native build platform, not the target: tsc/vite/esbuild output is
# architecture-independent, so emulating this stage under QEMU only makes it slow
# (and has hung outright). Only the runtime stage below is built per-architecture.
ARG BUILDPLATFORM=linux/amd64
FROM --platform=$BUILDPLATFORM node:24.18.0-slim AS builder
ARG BUILDPLATFORM

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY remotescraper/package.json ./remotescraper/
COPY remotescraper/tsconfig.json ./remotescraper/

# Chromium is installed via apt in the runtime stage, so Puppeteer must not
# also download its own copy -- that would add several hundred MB per arch.
# Puppeteer 22 recognises PUPPETEER_SKIP_DOWNLOAD; retain the older variable
# for compatibility with packages that still read it.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_SKIP_DOWNLOAD=true

RUN --mount=type=cache,id=pnpm-store-${BUILDPLATFORM},target=/pnpm/store \
    corepack enable && pnpm install --store-dir=/pnpm/store --frozen-lockfile --filter stealth-scraper...

COPY remotescraper/src ./remotescraper/src

RUN pnpm --filter stealth-scraper run build

# --- runtime stage ---------------------------------------------------------
FROM node:24.18.0-slim AS runtime

# Chromium plus the font packages Puppeteer needs to render non-Latin pages.
RUN apt-get update \
    && apt-get install -y \
      chromium \
      fonts-ipafont-gothic \
      fonts-wqy-zenhei \
      fonts-thai-tlwg \
      fonts-kacst \
      fonts-freefont-ttf \
      libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ARG TARGETPLATFORM

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY remotescraper/package.json ./remotescraper/

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_SKIP_DOWNLOAD=true

RUN --mount=type=cache,id=pnpm-store-${TARGETPLATFORM},target=/pnpm/store \
    corepack enable && pnpm install --store-dir=/pnpm/store --prod --frozen-lockfile --filter stealth-scraper...

COPY --from=builder /app/remotescraper/dist ./remotescraper/dist

RUN chown -R node:node /app
USER node

WORKDIR /app/remotescraper

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    PORT=5100

EXPOSE 5100

CMD ["node", "dist/remotescraper.js"]
