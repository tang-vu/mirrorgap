# Codebase summary

```
packages/core      domain schemas (zod), config, canonical JSON, market-hours
                   heuristic, freshness, parity, dispersion, data-quality,
                   anomaly classification, lifecycle, investigation ledger,
                   history series, incident timelines, receipts + capsules
                   (hash/verify/sign), pure evaluateAsset engine
packages/cmc       CMC client (auth, timeout, retry, limiter, TTL cache,
                   diagnostics), zod response schemas, adapter (pagination,
                   provenance, feature detection), fixtures incl. scripted
                   incident_cycle scenario, normalizers
packages/storage   MirrorGapStore contract + SqliteStore (WAL, migrations)
                   — events/transitions/watchlist/alert_log, retention pruning
packages/runtime   MirrorGapRuntime scan pipeline, lifecycle transitions,
                   alert dispatcher, history/timeline/capsule assembly,
                   watchlist + per-asset thresholds, fixture seed replay,
                   RuntimeBus, factory, explain (deterministic + bounded LLM)
apps/web           node:http API router (typed body errors, mutation guard,
                   rate limit), SSE, health probes, OpenAPI, static SPA
                   (modular views, hash router — vanilla JS, no build)
apps/cli           mirrorgap CLI — 16 commands, one file per group, --json
apps/mcp           MCP stdio server, 12 zod-validated tools over the runtime
scripts            demo-check.mjs, e2e-smoke.mjs (headless Chrome), benchmark.mjs
docs               this documentation set
submission         DoraHacks copy + X launch post
```

Tests: core 45 · cmc 14 · storage 4 · runtime 5 · web 19 · mcp 7 — 94 total,
plus `demo:check` (9 HTTP checks) and `e2e` (15 browser checks).
