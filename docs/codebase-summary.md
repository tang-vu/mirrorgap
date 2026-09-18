# Codebase summary

```
packages/core      domain schemas (zod), config, canonical JSON, market-hours
                   heuristic, freshness, parity, dispersion, data-quality,
                   anomaly classification, lifecycle, investigation ledger,
                   receipts (hash/verify/sign), pure evaluateAsset engine
packages/cmc       CMC client (auth, timeout, retry, limiter, TTL cache,
                   diagnostics), zod response schemas, adapter (pagination,
                   provenance, feature detection), fixtures, normalizers
packages/storage   MirrorGapStore contract + SqliteStore (WAL, migrations)
packages/runtime   MirrorGapRuntime scan pipeline, RuntimeBus, factory,
                   explain (deterministic + optional bounded LLM)
apps/web           node:http API router, SSE, static SPA (vanilla JS, no build)
apps/cli           mirrorgap commands over the runtime
apps/mcp           MCP stdio server, 7 tools over the runtime
scripts            demo-check.mjs e2e proof
docs               this documentation set
submission         DoraHacks copy + X launch post
```

Tests: core 45 · cmc 14 · storage 4 · runtime 4 · web 4 · mcp 2.
