# Console + investor portal (Next.js standalone). Build context: repo root —
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://api.example .
# NEXT_PUBLIC_* are inlined into the browser bundle at build time: never put a keyed RPC URL here.
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /src
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY clients/ts/package.json clients/ts/
RUN pnpm install --frozen-lockfile --filter @qupon/web...
COPY clients/ts clients/ts
COPY apps/web apps/web
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_HIDE_SERIES
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_HIDE_SERIES=$NEXT_PUBLIC_HIDE_SERIES NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL NEXT_PUBLIC_RPC_URL=$NEXT_PUBLIC_RPC_URL NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @qupon/web build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build /src/apps/web/.next/standalone ./
COPY --from=build /src/apps/web/.next/static ./apps/web/.next/static
# standalone output does not include public/ (the /sandbox/replay recording, task 91587)
COPY --from=build /src/apps/web/public ./apps/web/public
# The prerender cache dir must be writable by the runtime user (task 91561)
RUN mkdir -p ./apps/web/.next/cache && chown -R node:node ./apps/web/.next
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
