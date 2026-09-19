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

1. `resolveWatchlist` → map (`has_tokens`, top `watchLimit` by rank) ∪
   enabled rows in the `watchlist` table
2. `getRwaQuotes({rwaId: ids})` — one batched call (1 credit/250 ids)
3. `getRwaInfo` (cached) — `primary_exchange` enrichment
4. Per entry: normalize → `RwaAsset`, `TokenRepresentation[]`, `ReferenceObservation`, `TokenObservation[]`, `TradfiMarketContext[]`
5. `evaluateAsset` (pure) → `IntegritySnapshot` + optional anomaly
   (per-asset thresholds from the watchlist override global config)
6. `applyScanToEvent` → lifecycle transition recorded in
   `event_transitions` (create/confirm/escalate/de-escalate/peak/resolve/
   invalidate/recurrence)
7. On `confirmed`: `buildInvestigation` (claim ledger) → `buildReceipt` →
   optional Ed25519 sign → persist → `alertDispatcher` (deduplicated,
   severity-floor, webhook/Discord/Telegram) → emit on bus
8. Retention: rows older than `MIRRORGAP_RETENTION_DAYS` pruned post-scan

## Derived views (built on demand, no duplication)

- **History** — `assetHistory(rwaId, window)`: snapshots →
  `HistoryPoint[]` (deviation, dispersion, freshness, market state) +
  `HistoryStats`, downsampled to a bounded point count
- **Timeline** — `eventTimeline(eventId)`: event + transitions + receipt
  issuance → narrative `TimelineEntry[]`, each carrying a replay `frame`
  (referenceState, market, freshness, dispersion, gaps)
- **Capsule** — `evidenceCapsule(eventId)`: receipt + verification
  verdict + lifecycle stats + claim summary + provenance + limitations —
  the shareable proof bundle
- **Overview** — `overview()`: counters for the dashboard (assets,
  incidents by status, watchlist size, storage stats, capabilities)

## Fixture scenario

`incident_cycle` (default) is a deterministic script: each `advance()`
tick moves every fixture asset through quiet → candidate → escalation →
peak divergence → resolution → recurrence phases. `MIRRORGAP_SEED_TICKS`
replays real scans at pinned timestamps on boot, so the observatory
starts with a full lifecycle on record — the demo path. Live sources
simply do not implement `advance()`.

## HTTP surface (apps/web)

- Security headers on every response (CSP `default-src 'self'`, nosniff,
  frame-deny, referrer/permissions policy)
- Read endpoints: public, CORS `*` (no credentials involved)
- Mutations (`POST /scan`, watchlist writes): Origin/Host match check →
  loopback-only unless `MIRRORGAP_SCAN_TOKEN` → `x-scan-token` →
  per-IP rate limit (30/min → 429 + `retry-after`)
- Bodies: 64 KiB cap (413 `payload_too_large`), strict JSON
  (400 `bad_json`), zod validation at boundaries
- Structured error envelope `{ error: { code, message } }` everywhere
- Probes: `/api/v1/healthz` (liveness), `/api/v1/readyz` (readiness)

## Key invariants

- **Engine is pure** — `evaluateAsset` takes all inputs explicitly (incl. `now`); same inputs → same outputs
- **Receipts are self-verifying** — canonical JSON minus `receiptHash`/`signature` → SHA-256; verification needs only the receipt
- **Provenance everywhere** — every observation carries endpoint, params, retrieval time, request id, data mode
- **Secrets server-side** — `CMC_API_KEY` never leaves the Node process; the UI calls only the local API
- **Feature detection, not failure** — plan-gated endpoints record capability `no` and degrade visibly

## Persistence (SQLite, WAL)

`assets` · `issuers` · `representations` · `observations` · `snapshots` ·
`events` · `event_transitions` · `investigations` · `receipts` ·
`watchlist` · `alert_log` · `scan_runs` · `diagnostics` ·
`meta` (id sequences). All domain payloads stored as canonical JSON —
re-validated on read; migrations via `schema_migrations` table.
