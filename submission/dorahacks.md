# DoraHacks submission — MirrorGap

**Track:** Real World Assets
**Tagline:** Is tokenized reality still matching reality?

## One-liner

MirrorGap investigates disagreement between tokenized real-world asset wrappers, tests attributed underlying-price comparisons, and exports evidence that people and AI agents can independently inspect and audit.

## The problem

A tokenized stock or commodity can exist as several wrappers — `NVDAX`, `NVDAon` — trading 24/7 while the underlying reference keeps TradFi hours. An analyst seeing a gap needs to determine which prices are being compared, whether timestamps and units align, and what evidence another reviewer can inspect.

## What MirrorGap does

Every scan cycle, MirrorGap pulls the CoinMarketCap RWA dataset and evaluates each asset with a deterministic engine:

- **Parity gaps** — each wrapper vs the tokenized aggregate reference
- **Cross-wrapper dispersion** — wrappers disagreeing with each other
- **Freshness** — `fresh`/`aging`/`stale`/`unavailable`, explicitly
- **Market-hours semantics** — a stale or closed reference produces a _price difference_, never a false "verified parity failure"

Detected anomalies enter a lifecycle (candidate → confirmed → resolved/invalidated) whose every transition is recorded — escalation, peak divergence, recurrence — and replayable as a timeline. Each incident gets a deterministic investigation whose claims are labeled `observed` / `derived` / `supported_hypothesis` / `unknown`, a **verifiable evidence receipt** (canonical JSON, SHA-256, Ed25519-signable), and a shareable **Evidence Capsule** bundling receipt + verification + context + provenance. Anyone can re-hash and detect tampering. The system states what it measured; it never invents causes.

History is queryable per asset (deviation/dispersion/freshness series + stats), watchlists persist with per-asset thresholds, and lifecycle-aware alerts (webhook/Discord/Telegram) deduplicate repeats while re-alerting escalations.

Delivered surfaces: an observatory UI (radar, workbench, history, timeline replay, capsule, watchlist, diagnostics), REST with SSE and OpenAPI, CLI and a 14-tool MCP server. Existing Docker packaging is included; this upgrade is validated with the commands in `docs/upgrade-validation.md`.

## Why CoinMarketCap

The new **Investigation Workbench** adds leave-one-out peer comparisons, evidence-refresh guidance and optional underlying quotes with explicit unit mappings. It refuses incompatible comparisons. The same report is available through UI, REST, CLI and MCP. Receipt audit recalculates gaps and dispersion and checks evidence links: even a correctly rehashed wrong metric fails. See `docs/workbench.md` for the exact limits.

CMC's RWA endpoints supply the tokenized aggregate (`average_tokenized_price`), individual wrapper prices/issuers and TradFi venue context. These are essential inputs to the investigation, not decorative price widgets. The aggregate is not an independent underlying quote. `quotes/latest` powers comparisons; `map`/`info` and wrapper issuer fields bind them to an RWA. Market-pairs is feature-detected and labelled when unavailable. `scripts/cmc-evidence.ts` captures a real validated RWA response when a key is configured, without exporting credentials.

## Proof it works

- `pnpm demo:check` — boots the server, scans, verifies a receipt end-to-end (9 checks)
- `pnpm e2e` — headless-Chrome smoke including workbench refusal, receipt audit, timeline replay and tamper flow
- `pnpm demo:workbench` — repeatable open-session fixture, underlying comparison, independent export verification and rehashed-invalid receipt rejection
- `mirrorgap cmc-proof` — prints `/v1/key/info` + every CMC call (endpoint, status, credits, latency), key redacted
- `mirrorgap receipt <id> --verify` — independent hash verification; tamper any field → detected
- Fixture mode needs no key and is visibly labeled everywhere; live mode is one env var away
- Tests cover the engine, adapter, store, runtime, HTTP and MCP; see the validation report for actual counts
- `docker compose up --build` — one-command deploy with a seeded incident history

## Links

- Repo: https://github.com/tang-vu/mirrorgap
- Public demo (synthetic fixture): https://mirrorgap.tangvu.dev
- Live CMC call, code and response excerpt: `docs/cmc-live-evidence.md`
- Demo video: <demo-video-url>
- Docs: `docs/cmc-api-usage.md` (endpoints + field mapping), `docs/cmc-api-feedback.md` (honest API feedback), `docs/demo-script.md`

## Honest boundaries

Market hours modeled for US equity venues only (others → `unknown`). No trading signals, no arbitrage, no price prediction — this is an integrity layer, not a trading tool. Optional LLM narration can only re-word the deterministic claim ledger.

Independent underlying quotes are analyst supplied, not automatically fetched or source authenticated. Receipt hashes verify integrity, not CMC authorship or issuer backing. Workbench agent policy is guidance to consumers, not an execution sandbox. See `docs/upgrade-validation.md` for actual test results and remaining submission artifacts. The public deployment uses fixture data; no demo-video publication or X post is implied by this draft.
