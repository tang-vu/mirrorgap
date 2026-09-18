# MirrorGap demo script (~3 min)

## 0. Setup (10s)

```bash
pnpm install
pnpm --filter @mirrorgap/web dev   # → http://localhost:8787
```

Open the URL. Point at the badge: **fixture mode, clearly labeled** — "the
engine is identical in live mode; only the data source changes."

## 1. The question (15s)

> "A tokenized NVIDIA share can trade on a Saturday. NVDA the stock can't.
> So when the token drifts — who checks whether that's a real divergence or
> just a closed market? MirrorGap does."

Show the radar: each blip is an RWA, distance from center = divergence
severity. NVDA/TSLA/HOOD out on the rings, GOLD at center.

## 2. Asset detail (30s)

Click **NVDA** → per-wrapper gap table (`NVDAX` vs `NVDAon` vs the tokenized
aggregate), cross-wrapper dispersion, and the reference panel:

- reference state `market_closed` — _"this is the honest part: a closed
  reference can't confirm a parity failure, so the engine calls it a price
  difference, not an alarm"_
- freshness chips: `fresh` / `aging` / `stale`
- the representation graph: asset → wrappers → issuers

## 3. The event + the receipt (60s)

Events tab → open `MG-…-0001` (NVDA cross-wrapper dispersion, confirmed).

- **Claim ledger** — every sentence tagged `observed` / `derived` /
  `supported_hypothesis` / `unknown`. _"The engine states what it measured.
  It never invents a cause."_
- **Evidence receipt** — canonical JSON, `sha256:` hash, Ed25519-ready.

Verify live in a second terminal:

```bash
mirrorgap receipt MG-20260918-0001 --verify   # ✓ verified
```

Tamper test (optional, 15s): change one digit in the receipt via
`receipt --json > r.json`, edit, `receipt --verify --file r.json` → ✗ hash
mismatch.

## 4. Live CMC proof (30s)

```bash
export CMC_API_KEY=...
mirrorgap doctor       # plan + capabilities + credits
mirrorgap cmc-proof    # real calls: endpoint, status, credits, latency
```

> "Every call is logged — endpoint, HTTP status, credit count. Nothing is
> mocked in live mode, and fixture mode can never pretend to be live."

## 5. MCP (30s)

> "The same engine is an MCP server — agents get `mirrorgap_inspect_asset`,
> `mirrorgap_verify_receipt`, not just `get_price`."

## Closing line

> "Crypto has dashboards. Tokenized assets need an integrity layer.
> MirrorGap is the system that watches whether tokenized reality still
> agrees with reality — and it can prove what it saw."
