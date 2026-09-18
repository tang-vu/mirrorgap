# Deployment guide

## Local (default)

```bash
pnpm install && pnpm approve-builds --all
pnpm dev            # http://localhost:8787, auto mode
```

Requires Node ≥20, pnpm ≥10. `better-sqlite3` builds natively (allowlisted in `pnpm-workspace.yaml`).

## Environment

See `.env.example`. Minimum for live mode: `CMC_API_KEY`. Everything else has working defaults. `MIRRORGAP_DATA_MODE=auto` picks live when a key exists, fixture otherwise.

## Single-process deployment (Render / Railway / Fly / VPS)

The web app is one Node process (API + UI + SQLite + scheduler):

- **build:** `pnpm install --frozen-lockfile && pnpm approve-builds --all && pnpm -r build`
- **start:** `pnpm dev` (tsx) — or compile `apps/web` via `tsconfig.build.json` and run `node dist/server.js`
- **env:** `CMC_API_KEY`, `MIRRORGAP_DB_PATH` (persistent volume path), `PORT`
- **persistence:** mount a volume for the DB; `:memory:` works for demos but loses event history
- **`MIRRORGAP_SCAN_TOKEN`** if exposing `POST /api/v1/scan` publicly

## Notes

- SSE needs no extra infra; keep-alive handled; disable proxy buffering (`x-accel-buffering: no` already set)
- CLI and MCP run against the same DB — point `MIRRORGAP_DB_PATH` identically
- No browser env vars — the SPA talks only to its own origin API; the CMC key is never shipped client-side
