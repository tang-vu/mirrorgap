# DoraHacks submission — MirrorGap

**Track:** Real World Assets
**Tagline:** Is tokenized reality still matching reality?

## One-liner

MirrorGap is an autonomous observatory that continuously verifies whether tokenized real-world assets still agree with the reality they claim to represent — and issues cryptographically verifiable evidence when they don't.

## The problem

A tokenized stock or commodity can exist as several wrappers — `NVDAX`, `NVDAon` — trading 24/7 while the underlying reference keeps TradFi hours. When a wrapper drifts from its reference, or wrappers disagree with each other, nothing systematically detects, classifies, or proves it. Dashboards show prices; nobody checks _integrity_.

## What MirrorGap does

Every scan cycle, MirrorGap pulls the CoinMarketCap RWA dataset and evaluates each asset with a deterministic engine:

- **Parity gaps** — each wrapper vs the tokenized aggregate reference
- **Cross-wrapper dispersion** — wrappers disagreeing with each other
- **Freshness** — `fresh`/`aging`/`stale`/`unavailable`, explicitly
- **Market-hours semantics** — a stale or closed reference produces a _price difference_, never a false "verified parity failure"

Detected anomalies enter a lifecycle (candidate → confirmed → resolved/invalidated) whose every transition is recorded — escalation, peak divergence, recurrence — and replayable as a timeline. Each incident gets a deterministic investigation whose claims are labeled `observed` / `derived` / `supported_hypothesis` / `unknown`, a **verifiable evidence receipt** (canonical JSON, SHA-256, Ed25519-signable), and a shareable **Evidence Capsule** bundling receipt + verification + context + provenance. Anyone can re-hash and detect tampering. The system states what it measured; it never invents causes.

History is queryable per asset (deviation/dispersion/freshness series + stats), watchlists persist with per-asset thresholds, and lifecycle-aware alerts (webhook/Discord/Telegram) deduplicate repeats while re-alerting escalations.

Delivered surfaces: a live observatory UI (dashboard, radar, asset history charts, incident timeline replay, capsule view, watchlist, diagnostics), a versioned REST API with SSE + OpenAPI spec, a modular CLI (16 commands, `--json` everywhere), and a 12-tool MCP server exposing the engine to agents. Ships with Dockerfile + compose for a one-command deploy.

## Why CoinMarketCap

The RWA endpoint family is the only crypto API exposing **both sides** of a tokenized asset in one response: the tokenized aggregate (`average_tokenized_price`) _and_ each individual wrapper's price/issuer — plus TradFi exchange context. That shape makes parity verification possible without stitching sources. `quotes/latest` powers the engine; `map`/`info`/`issuers` build the identity graph; `/v1/key/info` powers `cmc-proof` — auditable evidence of real API usage. Market-pairs (Growth+) is feature-detected and honestly labeled when plan-gated.

## Proof it works

- `pnpm demo:check` — boots the server, scans, verifies a receipt end-to-end (9 checks)
- `pnpm e2e` — headless-Chrome smoke: every view, timeline replay, capsule verify, tamper flow (15 checks)
- `mirrorgap cmc-proof` — prints `/v1/key/info` + every CMC call (endpoint, status, credits, latency), key redacted
- `mirrorgap receipt <id> --verify` — independent hash verification; tamper any field → detected
- Fixture mode needs no key and is visibly labeled everywhere; live mode is one env var away
- 94 tests across the engine, adapter, store, runtime, API (19 HTTP cases), and MCP tools
- `docker compose up --build` — one-command deploy with a seeded incident history

## Links

- Repo: <repository-url>
- Demo video: <demo-video-url>
- Docs: `docs/cmc-api-usage.md` (endpoints + field mapping), `docs/cmc-api-feedback.md` (honest API feedback), `docs/demo-script.md`

## Honest boundaries

Market hours modeled for US equity venues only (others → `unknown`). No trading signals, no arbitrage, no price prediction — this is an integrity layer, not a trading tool. Optional LLM narration can only re-word the deterministic claim ledger.
