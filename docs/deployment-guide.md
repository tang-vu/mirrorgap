# Deployment guide

## Local (default)

```bash
pnpm install && pnpm approve-builds --all
pnpm dev            # http://localhost:8787, auto mode
```

Requires Node ≥20.10, pnpm ≥10 (repo pins `pnpm@12.4.2` via corepack).
`better-sqlite3` builds natively (allowlisted via `allowBuilds` in
`pnpm-workspace.yaml`).

## Docker (recommended for demos + deploys)

```bash
docker compose up --build        # → http://localhost:8787
```

The image is a two-stage build (`node:22-slim`):

- **deps**: `pnpm install --frozen-lockfile --prod` — workspace prod deps only
- **runtime**: non-root user (`mirrorgap`, uid 10001), `/data` volume for
  SQLite, `HEALTHCHECK` against `/api/v1/healthz`, `EXPOSE 8787`
- **command**: `node --import tsx apps/web/src/server.ts` — workspace packages
  export `src/*.ts` directly (by design: zero build step, single source of
  truth), so the production runtime is `tsx`, the same loader used in dev and
  CI. There is intentionally no compiled `dist/` to run.

Compose defaults: fixture mode, 31 seed ticks, 60 s scan interval, persistent
`mirrorgap-data` volume. Override via env:

```bash
MIRRORGAP_DATA_MODE=live CMC_API_KEY=… docker compose up -d
```

CLI inside the container:

```bash
docker run --rm -v mirrorgap-data:/data --entrypoint node mirrorgap \
  --import tsx apps/cli/src/main.ts radar
```

## Environment

See `.env.example` for the full list. Key groups:

- **Data**: `MIRRORGAP_DATA_MODE` (`auto|live|fixture`), `CMC_API_KEY`,
  `MIRRORGAP_FIXTURE_SCENARIO`, `MIRRORGAP_SEED_TICKS`
- **Engine**: `MIRRORGAP_SCAN_INTERVAL`, `MIRRORGAP_WATCH_LIMIT`,
  `MIRRORGAP_CONFIRM_SCANS`, `MIRRORGAP_THRESHOLD_{INFO,WATCH,HIGH,CRITICAL}`
- **Ops**: `MIRRORGAP_DB_PATH`, `MIRRORGAP_RETENTION_DAYS`, `PORT`,
  `MIRRORGAP_SCAN_TOKEN`, `MIRRORGAP_PUBLIC_URL`, `MIRRORGAP_SIGNING_KEY`
- **Alerts**: `MIRRORGAP_ALERT_WEBHOOK_URL`, `MIRRORGAP_DISCORD_WEBHOOK_URL`,
  `MIRRORGAP_TELEGRAM_BOT_TOKEN`, `MIRRORGAP_TELEGRAM_CHAT_ID`,
  `MIRRORGAP_ALERT_MIN_SEVERITY`

Minimum for live mode: `CMC_API_KEY`. Everything else has working defaults.
`MIRRORGAP_DATA_MODE=auto` picks live when a key exists, fixture otherwise.

## Single-process deployment (Render / Railway / Fly / VPS)

The web app is one Node process (API + UI + SQLite + scheduler):

- **build:** `pnpm install --frozen-lockfile && pnpm -r build` (build is
  typecheck-only for the web app — runtime uses `tsx`, see Docker notes)
- **start:** `pnpm -F @mirrorgap/web start` (tsx) or
  `node --import tsx apps/web/src/server.ts`
- **env:** `CMC_API_KEY`, `MIRRORGAP_DB_PATH` (persistent volume path), `PORT`
- **persistence:** mount a volume for the DB; `:memory:` works for demos but
  loses event history
- **`MIRRORGAP_SCAN_TOKEN`** — required if exposing mutations
  (`POST /api/v1/scan`, watchlist writes) beyond loopback; without it they are
  restricted to localhost

## Health probes

- `GET /api/v1/healthz` — process alive (liveness)
- `GET /api/v1/readyz` — store readable (readiness)
- `GET /api/v1/health` — full status incl. capabilities + uptime

## Production hardening checklist

- Set `MIRRORGAP_SCAN_TOKEN` before exposing the port beyond localhost
- Put TLS + auth in front via your platform/reverse proxy (the app speaks
  plain HTTP; mutations are already origin-guarded + rate-limited)
- `MIRRORGAP_RETENTION_DAYS=30` for long-running instances — snapshots store
  full gap detail; ~2 MiB per ~300 scans
- `MIRRORGAP_SIGNING_KEY` (base64 Ed25519 seed) for signed receipts;
  `/api/v1/verification-key` exposes the public key only
- Rotate `CMC_API_KEY` via env; it never appears in logs, diagnostics, or the
  UI (verified by tests)

## Notes

- SSE needs no extra infra; keep-alive handled; disable proxy buffering
  (`x-accel-buffering: no` already set)
- CLI and MCP run against the same DB — point `MIRRORGAP_DB_PATH` identically
- No browser env vars — the SPA talks only to its own origin API; the CMC key
  is never shipped client-side
