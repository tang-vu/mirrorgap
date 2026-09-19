# Changelog

## v2.0 — observatory release (2026-09-19)

The prototype became a continuously operating integrity observatory:
history, incident lifecycle tracking, verifiable evidence bundles, and
five surfaces (web, API, SSE, CLI, MCP) over one deterministic engine.

### Added

- **Incident lifecycle** — candidate → confirmed → resolved/invalidated
  with severity escalation/de-escalation, peak-divergence tracking, and
  recurrence detection; every transition persisted in `event_transitions`.
- **History** — `GET /api/v1/assets/:id/history?window=1h|6h|24h|7d|all`
  returns deviation/dispersion/freshness/market-state series plus stats,
  server-side downsampled. `mirrorgap history` renders it as a sparkline.
- **Incident timeline + replay** — `GET /api/v1/events/:id/timeline`
  builds a narrative (`created/confirmed/escalated/peak/resolved/receipt`)
  where each entry carries the snapshot frame the engine saw; the UI has a
  play/step replay control.
- **Evidence Capsules** — `GET /api/v1/capsules/:id` bundles receipt +
  verification verdict + lifecycle stats + claim summary + provenance +
  limitations. Capsule view includes a tamper playground (edit → verify →
  `INVALID — receipt hash mismatch`).
- **Watchlists** — persistent `watchlist` table; per-asset threshold
  overrides; `GET/POST/DELETE /api/v1/watchlist`, CLI `watchlist`, UI tab.
- **Lifecycle-aware alerting** — webhook/Discord/Telegram dispatcher with
  deduplication (escalations re-alert, repeats don't), min-severity floor,
  and an `alert_log` table + `/api/v1/alerts`.
- **Scripted fixture scenario** — `incident_cycle` advances deterministic
  phases (quiet → candidate → escalation → peak → resolution → recurrence);
  `MIRRORGAP_SEED_TICKS` replays real scans at pinned timestamps on boot.
- **Retention** — `MIRRORGAP_RETENTION_DAYS` prunes old observations,
  snapshots, transitions, alerts, diagnostics post-scan.
- **API** — new routes: `/overview`, `/healthz`, `/readyz`, `/scans`,
  `/alerts`, `/verification-key`, `POST /receipts/verify`, `/openapi.json`.
- **Security** — CSP + hardening headers; structured error envelope;
  bounded query params; enum allowlists; 64 KiB body cap (413); strict
  JSON (400); Origin/Host CSRF check; loopback-or-token mutation guard;
  30/min per-IP mutation rate limit (429 + retry-after).
- **CLI** — modular command files; new: `radar`, `stats`, `history`,
  `timeline`, `capsule`, `watchlist`, `alerts`, `seed`, `serve`; `--json`
  everywhere; meaningful exit codes.
- **MCP** — 12 tools: scan, radar, inspect, events, event, verify,
  history, timeline, capsule, watchlist, overview, cmc_status — all
  zod-validated with structured errors.
- **Deployment** — multi-stage Dockerfile (non-root, `/data` volume,
  healthcheck), `.dockerignore`, `docker-compose.yml` with fixture
  defaults and live-mode env pass-through.
- **Testing** — 94 vitest cases across the workspace; `demo:check` (9
  checks); `pnpm e2e` headless-Chrome smoke (15 checks incl. replay +
  tamper flow); `pnpm bench` endpoint benchmark.

### Fixed

- **`tokenSymbol` corruption** — gap/investigation/receipt symbols were
  derived by splitting `observationId` on `:`, but the ID ends with an
  ISO timestamp containing colons → symbols like `07.677Z`. The schema
  now carries `tokenSymbol` through normalization.
- **Oversized bodies** — the 64 KiB cap destroyed the socket before the
  response flushed; the drain-then-respond fix makes `413` reachable.
- **UI navigation** — overview stat cards pointed at non-existent routes.
- **Process leaks** — test/demo scripts spawned via `pnpm` wrappers that
  orphaned the server on Windows; they now spawn `node` directly.
- **Docker CMD workdir** — `--import tsx` can't resolve `tsx` from `/app`
  under pnpm's non-hoisted layout; the image now runs from `/app/apps/web`
  (build + container verified: seeded lifecycle, healthy, non-root).

### Changed

- Web UI split into modular views (`public/js/views/*`) with a hash
  router, SSE live refresh, and shared chart/util modules.
- Production runtime standardized on `tsx` (packages export `src/*.ts`;
  `node dist/` was never a supported path).
- `GET /api/v1/assets/:id` returns effective thresholds (watchlist
  override else global config) for chart bands.
