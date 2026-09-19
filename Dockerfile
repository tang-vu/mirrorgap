# MirrorGap — all-in-one observatory image.
# The workspace ships TypeScript sources (packages export ./src/*.ts), so the
# production runtime is `tsx` — the same loader used for dev and demo:check.
#
#   docker build -t mirrorgap .
#   docker run -p 8787:8787 -v mirrorgap-data:/data mirrorgap
#
# Live mode:  -e MIRRORGAP_DATA_MODE=live -e CMC_API_KEY=…
# Demo seed:  -e MIRRORGAP_SEED_TICKS=31  (fixture mode only)

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@12.4.2 --activate
WORKDIR /app

# ---- deps: install workspace with only production deps -----------------------
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/core/package.json packages/core/
COPY packages/cmc/package.json packages/cmc/
COPY packages/storage/package.json packages/storage/
COPY packages/runtime/package.json packages/runtime/
COPY apps/web/package.json apps/web/
COPY apps/cli/package.json apps/cli/
COPY apps/mcp/package.json apps/mcp/
RUN pnpm install --frozen-lockfile --prod

# ---- runtime ----------------------------------------------------------------
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN groupadd -r mirrorgap && useradd -r -g mirrorgap -u 10001 mirrorgap \
  && mkdir -p /data && chown mirrorgap:mirrorgap /data /app

# node_modules + workspace package manifests
COPY --from=deps --chown=mirrorgap:mirrorgap /app/node_modules ./node_modules
COPY --from=deps --chown=mirrorgap:mirrorgap /app/packages ./packages
COPY --from=deps --chown=mirrorgap:mirrorgap /app/apps ./apps
COPY --chown=mirrorgap:mirrorgap package.json pnpm-workspace.yaml ./

# workspace sources (packages export src/*.ts — see header comment)
COPY --chown=mirrorgap:mirrorgap packages/core/src packages/core/src
COPY --chown=mirrorgap:mirrorgap packages/cmc/src packages/cmc/src
COPY --chown=mirrorgap:mirrorgap packages/storage/src packages/storage/src
COPY --chown=mirrorgap:mirrorgap packages/runtime/src packages/runtime/src
COPY --chown=mirrorgap:mirrorgap apps/web/src apps/web/src
COPY --chown=mirrorgap:mirrorgap apps/web/public apps/web/public
COPY --chown=mirrorgap:mirrorgap apps/cli/src apps/cli/src
COPY --chown=mirrorgap:mirrorgap apps/mcp/src apps/mcp/src

USER mirrorgap
EXPOSE 8787
ENV MIRRORGAP_DB_PATH=/data/mirrorgap.db \
    PORT=8787 \
    MIRRORGAP_DATA_MODE=fixture

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/v1/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Workdir must be the app dir: pnpm's non-hoisted layout keeps `tsx` under
# apps/web/node_modules, so `--import tsx` only resolves from there.
WORKDIR /app/apps/web

# default: web observatory. The CLI is available as:
#   docker run --rm -v mirrorgap-data:/data -w /app/apps/cli \
#     --entrypoint node mirrorgap --import tsx src/main.ts radar
CMD ["node", "--import", "tsx", "src/server.ts"]
