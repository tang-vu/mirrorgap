# MirrorGap

> **Is tokenized reality still matching reality?**

MirrorGap is an autonomous observatory for tokenized real-world assets (RWAs). It continuously compares tokenized asset representations against the best available reference observations, detects meaningful parity gaps and cross-wrapper disagreement, investigates anomalies deterministically, and issues **verifiable, machine-readable evidence receipts**.

**Track:** Real World Assets · **Data:** CoinMarketCap API · **Stack:** TypeScript monorepo, SQLite, vanilla UI, MCP

---

## The problem

A tokenized stock, commodity, or fund can exist as several wrappers (e.g. `NVDAX`, `NVDAon`). Each trades 24/7 on crypto venues while the underlying reference trades on TradFi hours. When a wrapper drifts from its reference — or wrappers disagree with each other — who notices? Today: nobody systematically.

## What MirrorGap does

```
CMC RWA API ──► deterministic engine ──► event lifecycle ──► evidence receipt
 (observations)   (parity · dispersion ·   (candidate →        (canonical JSON +
                  freshness · mkt hours)    confirmed)          SHA-256 · Ed25519)
```

- **Parity radar** — every watched RWA, ranked by divergence, with explicit freshness (`fresh`/`aging`/`stale`) and underlying-market state (`open`/`closed`/`continuous`/`unknown`)
- **Honest semantics** — a stale or `market_closed` reference produces a _price difference_, not a verified parity failure. After-hours drift is labeled, not sensationalized
- **Cross-wrapper dispersion** — detects when wrappers disagree with each other, independent of market hours
- **Claim ledger** — every investigation statement is classified `observed` / `derived` / `supported_hypothesis` / `unknown`. The engine never invents causes
- **Evidence receipts** — canonical JSON → SHA-256 → optional Ed25519 signature. Anyone can re-hash and verify; tampering is detected
- **Live vs fixture** — always visible. Every provenance record carries the data mode

## Quickstart

Requires Node.js ≥ 20 and pnpm.

```bash
pnpm install
pnpm mirrorgap scan --fixture          # zero-config demo: no API key needed
pnpm --filter @mirrorgap/web dev       # observatory UI → http://localhost:8787
```

**Live mode** — set your CoinMarketCap key (server-side only, never shipped to the browser):

```bash
export CMC_API_KEY=your_key_here
pnpm mirrorgap doctor                  # verifies key, plan, capabilities
pnpm mirrorgap scan                    # real CMC data
```

Works on the **Basic/Startup plan** — `market-pairs` (Growth+) is feature-detected and visibly labeled unavailable when plan-gated.

## CLI

```bash
mirrorgap doctor                       # config, mode, capabilities, key info
mirrorgap scan [--symbols NVDA,TSLA]   # one observation scan
mirrorgap inspect NVDA                 # parity gaps, dispersion, freshness
mirrorgap watch                        # continuous scan loop
mirrorgap events [--status confirmed]  # anomaly lifecycle
mirrorgap event MG-20260918-0001       # claim ledger + receipt
mirrorgap receipt MG-20260918-0001 --verify   # independent hash verification
mirrorgap cmc-proof                    # proof of real CMC calls (key info + credits)
```

## HTTP API

| Route                                                      | Purpose                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------ |
| `GET /api/v1/radar`                                        | integrity radar, ranked by divergence                        |
| `GET /api/v1/assets?q=` `GET /api/v1/assets/:rwaId`        | search + asset detail                                        |
| `GET /api/v1/events` `GET /api/v1/events/:eventId?explain` | event lifecycle + claim ledger                               |
| `GET /api/v1/receipts/:eventId` `/verify`                  | receipt JSON + independent verification                      |
| `POST /api/v1/scan`                                        | trigger a scan (token-guarded if `MIRRORGAP_SCAN_TOKEN` set) |
| `GET /api/v1/stream`                                       | SSE live updates                                             |
| `GET /api/v1/diagnostics`                                  | CMC call log: endpoints, status, credits, latency            |

## MCP server

Exposes the engine to AI agents — tools go far beyond price lookups:

`mirrorgap_scan` · `mirrorgap_radar` · `mirrorgap_inspect_asset` · `mirrorgap_list_events` · `mirrorgap_get_event` · `mirrorgap_verify_receipt` · `mirrorgap_cmc_status`

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
                   lifecycle, investigation claim ledger, receipts
packages/cmc       CMC adapter: zod-validated responses, retry/backoff,
                   TTL cache, rate limiter, diagnostics, feature detection,
                   fixture source (9 scenarios)
packages/storage   SQLite store: migrations, assets/observations/snapshots/
                   events/investigations/receipts/diagnostics
packages/runtime   scan orchestration, event persistence, explanation layer
apps/web           HTTP API + SSE + observatory UI (zero-build vanilla SPA)
apps/cli           mirrorgap CLI
apps/mcp           MCP server
```

## Verify it yourself

```bash
pnpm test           # 60+ tests incl. end-to-end scan→receipt pipeline
pnpm typecheck      # strict TS across all packages
pnpm demo:check     # boots the server, scans, verifies a receipt — prints PASS
```

Tamper test: edit any number inside a stored receipt, then `--verify` → hash mismatch detected.

## What CMC made possible

The RWA endpoints provide something no other crypto API exposes cleanly: the **tokenized aggregate** (`average_tokenized_price`) alongside each individual wrapper's price — the exact two-sided observation MirrorGap needs, plus TradFi exchange context for market-hours semantics and issuer identity for the wrapper graph.

## Honest boundaries

- Market hours modeled for US equity venues (`us_regular_session_v1`); other venues → `unknown`
- `market-pairs` requires Growth+ — detected, labeled, never faked
- No price prediction, no trading signals, no arbitrage. This is an integrity observatory
- LLM (optional, off by default) can only re-word the deterministic claim ledger — never add claims

## License

MIT
