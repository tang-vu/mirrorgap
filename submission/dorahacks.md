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

Detected anomalies enter a lifecycle (candidate → confirmed → resolved/invalidated), get a deterministic investigation whose every claim is labeled `observed` / `derived` / `supported_hypothesis` / `unknown`, and a **verifiable evidence receipt** — canonical JSON, SHA-256 hashed, Ed25519-signable. Anyone can re-hash and detect tampering. The system states what it measured; it never invents causes.

Delivered surfaces: a live observatory UI (radar + search + asset detail + event investigation + relationship graph), a REST API with SSE, a CLI (`scan`, `inspect`, `watch`, `receipt --verify`, `cmc-proof`), and an MCP server exposing the engine to agents.

## Why CoinMarketCap

The RWA endpoint family is the only crypto API exposing **both sides** of a tokenized asset in one response: the tokenized aggregate (`average_tokenized_price`) _and_ each individual wrapper's price/issuer — plus TradFi exchange context. That shape makes parity verification possible without stitching sources. `quotes/latest` powers the engine; `map`/`info`/`issuers` build the identity graph; `/v1/key/info` powers `cmc-proof` — auditable evidence of real API usage. Market-pairs (Growth+) is feature-detected and honestly labeled when plan-gated.

## Proof it works

- `pnpm demo:check` — boots the server, scans, verifies a receipt end-to-end
- `mirrorgap cmc-proof` — prints `/v1/key/info` + every CMC call (endpoint, status, credits, latency), key redacted
- `mirrorgap receipt <id> --verify` — independent hash verification; tamper any field → detected
- Fixture mode needs no key and is visibly labeled everywhere; live mode is one env var away
- 70+ tests across the engine, adapter, store, runtime, API, and MCP tools

## Links

- Repo: <repository-url>
- Demo video: <demo-video-url>
- Docs: `docs/cmc-api-usage.md` (endpoints + field mapping), `docs/cmc-api-feedback.md` (honest API feedback), `docs/demo-script.md`

## Honest boundaries

Market hours modeled for US equity venues only (others → `unknown`). No trading signals, no arbitrage, no price prediction — this is an integrity layer, not a trading tool. Optional LLM narration can only re-word the deterministic claim ledger.
