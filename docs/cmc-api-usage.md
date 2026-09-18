# CoinMarketCap API usage in MirrorGap

Verified against the official documentation (pro-api reference, RWA section)
at implementation time. Every response is runtime-validated with zod before
use — invalid payloads are rejected, never silently mapped.

## Endpoints used

| Endpoint                                              | Plan        | Used for                                                                                                                           |
| ----------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v5/real-world-assets/map`                       | Basic+      | Watchlist resolution: which RWAs have token representations                                                                        |
| `GET /v5/real-world-assets/info`                      | Basic+      | Asset metadata, `primary_exchange` (drives market-hours state)                                                                     |
| `GET /v5/real-world-assets/quotes/latest`             | Basic+      | **Core.** `average_tokenized_price` → reference observation; `tokens[]` → wrapper observations; `tradfi_markets[]` → venue context |
| `GET /v5/real-world-assets/assets/list`               | Basic+      | Identity graph enrichment                                                                                                          |
| `GET /v5/real-world-assets/issuers/list` + `/issuers` | Basic+      | Issuer identity for the wrapper graph                                                                                              |
| `GET /v5/real-world-assets/market-pairs/list`         | **Growth+** | Liquidity context — feature-detected, unavailable on Startup                                                                       |
| `GET /v1/key/info`                                    | all         | `mirrorgap doctor` / `cmc-proof`: plan + credit verification                                                                       |

## Field mapping (quotes/latest)

- `average_tokenized_price` → `ReferenceObservation.price` (the reference)
- `last_updated` → `ReferenceObservation.observedAt` (timestampSource: `source`)
- `tokens[].price` → `TokenObservation.price` (timestampSource: `retrieval` — no per-token timestamp upstream)
- `tokens[].crypto_id / symbol / issuer_id / issuer_name` → `TokenRepresentation` identity graph
- `tradfi_markets[].exchange` → underlying-market context
- `tokenized_market_cap / tokenized_volume_24h` → reference context

## Credit economy

One batched `quotes/latest` call (≤250 ids) covers the whole watchlist per
scan — 1 credit per scan. `info` + `map` are TTL-cached. Default 60s scans
fit comfortably inside Startup-tier daily limits.

## Plan gating behavior

`market-pairs` returns plan-gated errors on Startup → capability recorded as
`no`, surfaced in `/api/v1/health`, the UI badge, and `doctor`. Liquidity
analysis degrades gracefully and is never faked.

## Proof path

`mirrorgap cmc-proof` (live mode) prints the `/v1/key/info` response and the
diagnostic log of every CMC call: endpoint, HTTP status, credit count,
latency — with the API key redacted everywhere.
