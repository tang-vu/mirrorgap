# CoinMarketCap RWA API — honest feedback from building on it

Written as hackathon feedback: what worked, what didn't, what would unlock
more.

## What worked well

- **The `quotes/latest` response shape is the product.** One call returns the
  tokenized aggregate _and_ every individual wrapper with price, market cap,
  volume, issuer — exactly the two-sided observation needed for parity work.
  No stitching endpoints together.
- **TradFi context included for free.** `tradfi_markets[]` with exchange slug
  let us attach market-hours semantics without a second data source.
- **Startup-plan coverage is real.** map, info, list, quotes, issuers are all
  usable on the free tier — a hackathon project can actually run.
- **Structured error codes** (`status.error_code`) made plan-gating detection
  clean (1006/403 → capability `no`, not a failure).
- **Issuer identity on each token** (`issuer_id`, `issuer_name`) enabled the
  wrapper→issuer graph without extra lookups.

## Friction / limitations hit

- **No per-token timestamps.** The aggregate has `last_updated`, individual
  wrappers don't. Cross-freshness analysis (is wrapper B staler than wrapper
  A?) isn't possible — we record `timestampSource: retrieval` and say so in
  every receipt. A per-token `last_updated` would sharpen anomaly semantics.
- **Market-pairs is Growth+.** The one endpoint that would let us test
  _why_ a gap exists (thin book? one bad venue?) is gated above Startup. We
  feature-detect and degrade, but the most interesting hypothesis can't be
  tested on the free tier.
- **No historical RWA quotes.** Anomaly confirmation is time-series by
  nature; without a historical endpoint we persist our own snapshots. A
  `/quotes/historical` for RWA would enable backtesting and charting.
- **Aggregate methodology is opaque.** `average_tokenized_price` — weighted
  how? By what venues? For parity verification the reference's construction
  matters; a documented method (or per-venue breakdown) would increase trust.
- **Source time versus update cadence.** The current official reference documents
  a 60-second update frequency for `quotes/latest`. That does not establish each
  wrapper's source time or synchronization. We still need per-wrapper timestamps.

## Wishlist (in priority order)

1. Per-token `last_updated` in `tokens[]`.
2. RWA quotes historical endpoint (even 24h of 5m points).
3. Documented aggregate methodology (weights, venues, staleness policy).
4. Market-pairs on Startup, or a degraded "venue count" field on quotes.
5. Underlying TradFi price as a field (the true reference), not just venue links.

## What the workbench adds

The RWA shape makes wrapper and aggregate investigation possible. The workbench
uses it for leave-one-out peer comparisons and evidence-linked reports, and
separately accepts an analyst-supplied underlying quote with explicit conversion
ratios. It never calls the tokenized aggregate an independent underlying price.
An authenticated underlying quote and reliable conversion metadata remain the
largest gaps for investigating actual token/underlying parity.
