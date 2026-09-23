# MirrorGap

> **Is tokenized reality still matching reality?**

**[Open the demo](https://mirrorgap.tangvu.dev)** — the public demo uses clearly labeled synthetic fixture data.

MirrorGap is an autonomous observatory for tokenized real-world assets (RWAs). It continuously compares tokenized asset representations against the best available reference observations, detects meaningful parity gaps and cross-wrapper disagreement, investigates anomalies deterministically, tracks each incident's lifecycle over time, and issues **verifiable, machine-readable evidence** — receipts and capsules that anyone can re-hash and check.

**Track:** Real World Assets · **Data:** CoinMarketCap API · **Stack:** TypeScript monorepo, SQLite, vanilla UI, REST + SSE, CLI, MCP

The loop: **Observe → Detect → Investigate → Prove.**

**New: Investigation Workbench.** Compare wrappers against their peers, challenge the
CMC aggregate with an attributed underlying quote and explicit units per token,
then export the evidence. User-supplied quotes remain indicative and unauthenticated.
Audit receipts offline to recompute arithmetic as well as verify hashes.
See [workbench guide](docs/workbench.md), [community winner research](docs/competitive-research.md)
and [upgrade validation](docs/upgrade-validation.md).

**Optical observatory UI:** selectable signed wrapper registrations, a retained-incident evidence journey, a tabbed investigation workspace, explicit quote-unit review and separate integrity/arithmetic/signature outcomes.
See [design and browser validation](docs/frontend-design.md).

---

## The problem

A tokenized stock, commodity, or fund can exist as several wrappers (e.g. `NVDAX`, `NVDAon`). Each can trade on crypto venues while the underlying follows different hours. An analyst needs to separate wrapper disagreement from a true underlying-price divergence, inspect the evidence and reproduce the comparison.

## What MirrorGap does

```
CMC RWA API ──► deterministic engine ──► event lifecycle ──► evidence
 (observations)   (parity · dispersion ·   (candidate →          (receipt + capsule:
                  freshness · mkt hours)    confirmed →           canonical JSON +
                                           resolved/recurring)   SHA-256 · Ed25519)
```

- **Parity radar** — every watched RWA, ranked by divergence, with explicit freshness (`fresh`/`aging`/`stale`) and underlying-market state (`open`/`closed`/`continuous`/`unknown`)
- **Honest semantics** — a stale or `market_closed` reference produces a _price difference_, not a verified parity failure. After-hours drift is labeled, not sensationalized
- **Cross-wrapper dispersion** — detects when wrappers disagree with each other, independent of market hours
- **Incident lifecycle** — candidate → confirmed → resolved/invalidated, with severity escalation, peak divergence, recurrence detection, and a replayable transition log
- **History** — per-asset time series (deviation, dispersion, freshness, market state) with downsampling and stats
- **Claim ledger** — every investigation statement is classified `observed` / `derived` / `supported_hypothesis` / `unknown`. The engine never invents causes
- **Evidence receipts** — canonical JSON → SHA-256 → optional Ed25519 signature. Anyone can re-hash and verify; tampering is detected
- **Evidence Capsules** — shareable incident bundles: receipt + verification verdict + asset/lifecycle context + claim summary + provenance + limitations
- **Watchlists + alerts** — pin assets, override thresholds per asset, get lifecycle-aware alerts (webhook/Discord/Telegram) with deduplication — escalations re-alert, repeats don't
- **Live vs fixture** — always visible. Every provenance record carries the data mode; fixtures follow a scripted incident scenario

## Quickstart

Requires Node.js ≥ 20 and pnpm.

```bash
pnpm install
pnpm mirrorgap seed --ticks 31          # deterministic demo history (fixture)
pnpm --filter @mirrorgap/web dev        # observatory UI → http://localhost:8787
```

Or zero-config, one command:

```bash
pnpm mirrorgap scan --fixture           # no API key needed
```

**Docker** (single container, fixture demo):

```bash
docker compose up --build               # → http://localhost:8787, seeded
```

**Live mode** — set your CoinMarketCap key (server-side only, never shipped to the browser):

```bash
export CMC_API_KEY=your_key_here
pnpm mirrorgap doctor                   # verifies key, plan, capabilities
pnpm mirrorgap scan                     # real CMC data
```

Works on the **Basic/Startup plan** — `market-pairs` (Growth+) is feature-detected and visibly labeled unavailable when plan-gated.

## CLI

```bash
mirrorgap doctor                       # config, mode, capabilities, key info
mirrorgap scan [--symbols NVDA,TSLA]   # one observation scan
mirrorgap radar                        # integrity radar, ranked by divergence
mirrorgap inspect NVDA                 # parity gaps, dispersion, freshness
mirrorgap workbench NVDA               # peer review + evidence gaps, JSON output
mirrorgap workbench NVDA --underlying quote.json # attributed underlying comparison
mirrorgap audit --file capsule.json    # offline hash + arithmetic + evidence links
mirrorgap history NVDA --window 7d     # time series + stats
mirrorgap watch                        # continuous scan loop
mirrorgap events [--status confirmed]  # anomaly lifecycle
mirrorgap event MG-20260919-0001       # claim ledger + receipt
mirrorgap timeline MG-20260919-0001    # replayable incident narrative
mirrorgap capsule MG-20260919-0001     # shareable evidence bundle
mirrorgap receipt MG-20260919-0001 --verify   # independent hash verification
mirrorgap watchlist add NVDA --thresholds 0.5,1,2,4
mirrorgap alerts                       # alert destinations + recent log
mirrorgap seed --ticks 31              # replay deterministic fixture history
mirrorgap stats                        # storage + scan stats
mirrorgap cmc-proof                    # proof of real CMC calls
mirrorgap serve                        # web server (same as pnpm dev)
```

Every command supports `--json` for machine-readable output and `--fixture`/`--live`/`--db <path>` overrides.

## HTTP API

| Route                                                     | Purpose                                             |
| --------------------------------------------------------- | --------------------------------------------------- |
| `GET /api/v1/health` `· /healthz` `· /readyz`             | status + deployment probes                          |
| `GET /api/v1/overview`                                    | observatory counters for the dashboard              |
| `GET /api/v1/radar`                                       | integrity radar, ranked by divergence               |
| `GET /api/v1/assets?q=` `GET /api/v1/assets/:rwaId`       | search + asset detail                               |
| `GET /api/v1/assets/:rwaId/history?window=…`              | time series + stats (`1h/6h/24h/7d/all`, bounded)   |
| `GET /api/v1/events` `GET /api/v1/events/:eventId`        | event lifecycle + claim ledger                      |
| `GET /api/v1/events/:eventId/timeline`                    | replayable incident narrative + snapshot frames     |
| `GET /api/v1/capsules/:eventId`                           | Evidence Capsule (receipt + context + verification) |
| `GET /api/v1/receipts/:eventId` `/verify` `POST …/verify` | receipt JSON + independent verification             |
| `GET /api/v1/verification-key`                            | public verification key (never the private key)     |
| `GET/POST/DELETE /api/v1/watchlist`                       | persistent watchlist + per-asset thresholds         |
| `GET /api/v1/alerts`                                      | alert destinations + recent alert log               |
| `GET /api/v1/scans` `POST /api/v1/scan`                   | scan history + trigger (guarded)                    |
| `GET /api/v1/stream`                                      | SSE live updates                                    |
| `GET /api/v1/diagnostics`                                 | CMC call log: endpoints, status, credits, latency   |
| `GET /openapi.json`                                       | OpenAPI spec                                        |

Error envelope: `{ "error": { "code", "message" } }`. Mutations are origin-checked, loopback/token-guarded, body-capped (64 KiB → 413), and rate-limited (30/min/IP → 429).

## MCP server

Exposes the engine to AI agents — investigation tools, not price lookups:

`mirrorgap_scan` · `mirrorgap_radar` · `mirrorgap_inspect_asset` · `mirrorgap_list_events` · `mirrorgap_get_event` · `mirrorgap_verify_receipt` · `mirrorgap_history` · `mirrorgap_timeline` · `mirrorgap_capsule` · `mirrorgap_watchlist` · `mirrorgap_overview` · `mirrorgap_cmc_status`

```json
{ "mcpServers": { "mirrorgap": { "command": "pnpm", "args": ["--filter", "@mirrorgap/mcp", "start"] } } }
```

## CoinMarketCap endpoints used

All under `https://pro-api.coinmarketcap.com` with `X-CMC_PRO_API_KEY`:

- `GET /v5/real-world-assets/map` — watchlist resolution
- `GET /v5/real-world-assets/info` — asset metadata, primary exchange
- `GET /v5/real-world-assets/quotes/latest` — **core**: tokenized aggregate reference + per-wrapper token observations + TradFi market context
- `GET /v5/real-world-assets/assets/list`, `/issuers/list`, `/issuers` — identity graph enrichment
- `GET /v5/real-world-assets/market-pairs/list` — liquidity context (**Growth+**, feature-detected)
- `GET /v1/key/info` — plan/credit verification (`mirrorgap cmc-proof`)

## Architecture

```
packages/core      deterministic engine: parity, dispersion, freshness,
                   market-hours heuristic, anomaly classification, event
                   lifecycle, claim ledger, history, timelines, receipts,
                   capsules
packages/cmc       CMC adapter: zod-validated responses, retry/backoff,
                   TTL cache, rate limiter, diagnostics, feature detection,
                   fixture source (scripted incident-cycle scenario)
packages/storage   SQLite store: migrations, assets/observations/snapshots/
                   events/transitions/investigations/receipts/watchlist/
                   alert_log/diagnostics, retention pruning
packages/runtime   scan orchestration, lifecycle transitions, alerting,
                   history/timeline/capsule assembly, fixture seed replay
apps/web           HTTP API + SSE + observatory UI (zero-build vanilla SPA)
apps/cli           mirrorgap CLI (modular commands, --json everywhere)
apps/mcp           MCP server over stdio (14 tools)
```

## Verify it yourself

```bash
pnpm test           # 90+ tests incl. end-to-end scan→receipt pipeline
pnpm typecheck      # strict TS across all packages
pnpm demo:check     # boots the server, scans, verifies a receipt — prints PASS
pnpm e2e            # headless-Chrome smoke: views, replay, tamper flow
pnpm bench          # endpoint latency benchmark
```

Tamper test: edit any number inside a stored receipt, then `--verify` → hash mismatch detected. The same flow is built into the capsule view's tamper playground.

## What CMC made possible

The RWA endpoints provide the **tokenized aggregate** (`average_tokenized_price`) alongside individual wrapper prices, TradFi exchange context and issuer identities. MirrorGap uses those observations for aggregate and peer comparisons. They are not two independent measurements of the underlying asset; an underlying comparison needs an additional attributed quote and explicit token-unit mapping.

## Honest boundaries

- Market hours modeled for US equity venues (`us_regular_session_v1`); other venues → `unknown`
- `market-pairs` requires Growth+ — detected, labeled, never faked
- No price prediction, no trading signals, no arbitrage. This is an integrity observatory
- CMC aggregate prices are not independent underlying prices. The optional underlying
  comparator uses analyst-supplied quotes and unit ratios; no automatic cash-market feed exists yet
- LLM (optional, off by default) can only re-word the deterministic claim ledger — never add claims

## License

MIT
