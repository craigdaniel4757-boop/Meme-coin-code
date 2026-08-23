# Single-service deployment: builds both apps, serves the frontend as
# static files from the same Express process that runs the API (see the
# static-serving block in apps/server/src/index.ts). One container, one
# port, one URL - no CORS or two-service wiring needed in production.
#
# Build context is this directory (hearthstone-bg-coach/). On a platform
# that deploys from a monorepo, point its "root directory" here.

FROM node:20-slim AS build
WORKDIR /app

COPY apps/server/package.json apps/server/package-lock.json apps/server/
COPY apps/web/package.json apps/web/package-lock.json apps/web/
RUN npm --prefix apps/server ci
RUN npm --prefix apps/web ci

COPY apps/server apps/server
COPY apps/web apps/web
RUN npm --prefix apps/server run build
RUN npm --prefix apps/web run build

FROM node:20-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY apps/server/package.json apps/server/package-lock.json apps/server/
RUN npm --prefix apps/server ci --omit=dev

COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/web/dist apps/web/dist

ENV NODE_ENV=production
# Most hosts (Render, Railway, Fly) inject PORT themselves; 8787 is the
# local-run/default fallback.
ENV PORT=8787
EXPOSE 8787

CMD ["node", "apps/server/dist/index.js"]
