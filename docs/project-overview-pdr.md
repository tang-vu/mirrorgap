# MirrorGap — Project Overview & PDR

## Vision

**"Is tokenized reality still matching reality?"**

MirrorGap is an autonomous observatory for tokenized real-world assets. It is the integrity layer between tokenized representations and the references they claim to mirror — detecting divergence, explaining it honestly, and proving what was observed.

Built for the CoinMarketCap API Hackathon — **Real World Assets track**.

## Problem

Tokenized RWAs (equities, commodities, funds) exist as multiple wrappers trading 24/7 on crypto venues while their references trade on TradFi hours. Divergence between wrappers, or between a wrapper and its reference, is today detected anecdotally — if at all. There is no systematic, verifiable answer to "does this token still represent reality?"

## Non-goals (explicit)

- Not a dashboard, not a price tracker, not a trading/arbitrage bot, not an LLM wrapper around a market API
- No price prediction, no signals, no execution

## Core requirements

1. Compare every wrapper against the tokenized aggregate reference (parity gap)
2. Measure cross-wrapper dispersion independently of the reference
3. Explicit freshness: `fresh`/`aging`/`stale`/`unavailable`
4. Explicit market state: `open`/`closed`/`continuous`/`unknown` — stale/closed references produce `price_difference`, not verified parity failure
5. Deterministic anomaly detection; event lifecycle candidate → confirmed → resolved/invalidated
6. Claim ledger: `observed` / `derived` / `supported_hypothesis` / `unknown`
7. Verifiable evidence receipts: canonical JSON + SHA-256 + optional Ed25519
8. Live vs fixture mode always visible in provenance and UI
9. AI is interface/narration only — bounded to rewording deterministic claims
10. Startup-tier compatible; Growth+ features (market-pairs) feature-detected

## Surfaces

- Observatory web UI (radar, search, asset detail, event investigation, graph)
- REST API + SSE
- CLI (`doctor`, `scan`, `inspect`, `watch`, `events`, `receipt`, `cmc-proof`)
- MCP server (7 domain tools)

## Success criteria

- Judge can run `pnpm install && pnpm mirrorgap scan --fixture` with zero secrets
- Judge can verify a receipt independently and detect tampering
- Judge can audit exactly which CMC endpoints produced a claim
- `pnpm demo:check` passes end-to-end
