# System architecture

```
                ┌────────────────────────────────────────────────┐
                │              CoinMarketCap API                  │
                │  /v5/real-world-assets/{map,info,quotes,…}      │
                │  /v1/key/info                                   │
                └──────────────┬─────────────────────────────────┘
                               │ X-CMC_PRO_API_KEY (server-side only)
                ┌──────────────▼─────────────────────────────────┐
                │  @mirrorgap/cmc                                 │
                │  zod-validated client · retry/backoff · TTL     │
                │  cache · rate limiter · diagnostics · feature   │
                │  detection · fixture source (same contract)     │
                └──────────────┬─────────────────────────────────┘
                               │ CmcResult<T> + Provenance
                ┌──────────────▼─────────────────────────────────┐
                │  @mirrorgap/runtime — scan orchestration        │
                │  resolve watchlist → fetch quotes → normalize   │
                │  → evaluate → persist → lifecycle → receipt     │
                │  RuntimeBus (pub/sub for SSE/CLI/MCP)           │
                └───┬──────────────┬──────────────┬──────────────┘
                    │              │              │
        ┌───────────▼───┐  ┌───────▼──────┐  ┌───▼───────────────┐
        │ @mirrorgap/   │  │ @mirrorgap/  │  │ @mirrorgap/       │
        │ core (pure)   │  │ storage      │  │ explain (bounded  │
        │ parity ·      │  │ SQLite WAL   │  │ LLM, optional)    │
        │ dispersion ·  │  │ migrations · │  │ deterministic     │
        │ freshness ·   │  │ repos for    │  │ narrator always   │
        │ market hours  │  │ all entities │  │ available         │
        │ · anomaly ·   │  └──────────────┘  └───────────────────┘
        │ lifecycle ·   │
        │ investigation │         consumers (same runtime):
        │ · receipts    │  ┌────────┐  ┌────────┐  ┌────────┐
        └───────────────┘  │apps/web│  │apps/cli│  │apps/mcp│
                           │ API+SSE│  │mirrorgap│ │stdio   │
                           │ + UI   │  └────────┘  └────────┘
                           └────────┘
```

## Data flow per scan

1. `resolveWatchlist` → map (`has_tokens`, top `watchLimit` by rank)
2. `getRwaQuotes({rwaId: ids})` — one batched call (1 credit/250 ids)
3. `getRwaInfo` (cached) — `primary_exchange` enrichment
4. Per entry: normalize → `RwaAsset`, `TokenRepresentation[]`, `ReferenceObservation`, `TokenObservation[]`, `TradfiMarketContext[]`
5. `evaluateAsset` (pure) → `IntegritySnapshot` + optional anomaly
6. `applyScanToEvent` → lifecycle transition (create/confirm/update/resolve)
7. On `confirmed`: `buildInvestigation` (claim ledger) → `buildReceipt` → optional Ed25519 sign → persist → emit on bus

## Key invariants

- **Engine is pure** — `evaluateAsset` takes all inputs explicitly (incl. `now`); same inputs → same outputs
- **Receipts are self-verifying** — canonical JSON minus `receiptHash`/`signature` → SHA-256; verification needs only the receipt
- **Provenance everywhere** — every observation carries endpoint, params, retrieval time, request id, data mode
- **Secrets server-side** — `CMC_API_KEY` never leaves the Node process; the UI calls only the local API
- **Feature detection, not failure** — plan-gated endpoints record capability `no` and degrade visibly

## Persistence (SQLite, WAL)

`assets` · `issuers` · `representations` · `observations` · `snapshots` ·
`events` · `investigations` · `receipts` · `scan_runs` · `diagnostics` ·
`meta` (id sequences). All domain payloads stored as canonical JSON —
re-validated on read; migrations via `schema_migrations` table.
