# Performance

Measured with `pnpm bench` (scripts/benchmark.mjs): fixture mode, 31 seeded
scans, n=20 reads / n=10 scans per endpoint, single Node process on a Windows
dev machine (Node 24). Numbers are illustrative, not guarantees — rerun the
script on your own hardware.

## Endpoint latency (seeded DB: ~287 snapshots, 150 transitions)

| Endpoint                          | p50     | p95     | notes                                  |
| --------------------------------- | ------- | ------- | -------------------------------------- |
| `POST /api/v1/scan`               | ~12 ms  | ~700 ms | p95 = first scan (cold JIT + zod init) |
| `GET /api/v1/radar`               | ~1.2 ms | ~3 ms   | latest snapshot per asset              |
| `GET /api/v1/assets/:id`          | ~1.0 ms | ~2 ms   |                                        |
| `GET /api/v1/assets/:id/history`  | ~2.4 ms | ~7 ms   | `window=all`, downsampled to 720 pts   |
| `GET /api/v1/events/:id`          | ~5.6 ms | ~13 ms  | includes investigation + timeline      |
| `GET /api/v1/events/:id/timeline` | ~1.9 ms | ~2 ms   |                                        |
| `GET /api/v1/capsules/:id`        | ~1.8 ms | ~3 ms   | includes receipt verification          |
| `GET /api/v1/receipts/:id/verify` | ~1.3 ms | ~2 ms   |                                        |
| `GET /api/v1/overview`            | ~1.5 ms | ~2 ms   |                                        |

## Cost notes

- **One CMC call per scan.** `quotes/latest` batches the whole watchlist
  (`rwaId` list) into a single request — 1 credit per ≤250 assets. The map/info
  calls are TTL-cached, so steady-state scanning costs ~1 credit/min at the
  default 60 s interval (~1,440 credits/day — plan accordingly).
- **History is bounded.** `maxPoints` downsamples server-side; the UI never
  receives more than ~720 points regardless of snapshot count.
- **Storage grows ~2 MiB per ~300 snapshots.** Snapshots store full gap detail
  as canonical JSON. `MIRRORGAP_RETENTION_DAYS` prunes observations/snapshots/
  transitions older than the window (default keeps everything; set e.g. `30`
  for long-running deployments).
- **Rate limits.** Mutations are capped at 30 req/min/IP; read endpoints are
  unthrottled (they only read SQLite).
- **SSE fan-out** is O(subscribers); no polling, no per-client state.

## Determinism

Fixture scans are reproducible: the same seed (`MIRRORGAP_SEED_TICKS`) produces
the same snapshot series, events, and receipt hashes. Timestamps are pinned to
the scan clock — replay is exact.
