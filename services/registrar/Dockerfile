# Multi-stage image for the Qupon registrar (Fly.io / Railway).
# Build context is the repo root:
#   docker build -f services/registrar/Dockerfile .
# Final image: Go API + Node 22 + the built `qupon` CLI for the executor.

# --- stage 1: Go API ---------------------------------------------------------
FROM golang:1.26-alpine AS go-build
WORKDIR /src
COPY services/registrar/go.mod services/registrar/go.sum ./services/registrar/
WORKDIR /src/services/registrar
RUN go mod download
WORKDIR /src
COPY services/registrar ./services/registrar
WORKDIR /src/services/registrar
RUN CGO_ENABLED=0 go build -trimpath -o /out/registrar ./cmd/registrar

# --- stage 2: qupon CLI (Node) ----------------------------------------------
FROM node:22-alpine AS cli-build
RUN corepack enable
WORKDIR /build
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY clients/ts/package.json ./clients/ts/
RUN pnpm install --frozen-lockfile --filter @qupon/client
COPY clients/ts ./clients/ts
RUN pnpm --filter @qupon/client build \
 && pnpm --filter @qupon/client deploy --prod /cli

# --- stage 3: runtime --------------------------------------------------------
FROM node:22-alpine
RUN apk add --no-cache su-exec && addgroup -S qupon && adduser -S qupon -G qupon
WORKDIR /app
COPY --from=go-build /out/registrar /app/registrar
COPY --from=cli-build /cli /app/cli
# Public series/mint config (in git) for the executor's --series names; redeploy after adding a series.
COPY config/devnet.json /app/config/devnet.json
COPY services/registrar/entrypoint.sh /app/entrypoint.sh
# `qupon` shim so QUPON_CLI can stay at its default path.
RUN printf '#!/bin/sh\nexec node /app/cli/dist/cli.js "$@"\n' \
      > /usr/local/bin/qupon && chmod +x /usr/local/bin/qupon
# Starts as root only to chown the volume and write keypair secrets; entrypoint.sh drops to `qupon`.
# /data holds the SQLite mirror; mount a Fly volume here.
ENV DB_PATH=/data/registrar.db PORT=8080 QUPON_CONFIG=/app/config/devnet.json
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["/app/entrypoint.sh"]
