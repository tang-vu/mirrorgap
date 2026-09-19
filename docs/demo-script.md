# MirrorGap demo script (~4 min)

## 0. Setup (10s)

```bash
pnpm install
MIRRORGAP_SEED_TICKS=31 pnpm dev    # → http://localhost:8787, seeded
```

(Or `docker compose up --build` — same result.)

Open the URL. Point at the badge: **fixture mode, clearly labeled** — "the
engine is identical in live mode; only the data source changes. The seed
replays real scans so we already have a full incident history."

## 1. The question (15s)

> "A tokenized NVIDIA share can trade on a Saturday. NVDA the stock can't.
> So when the token drifts — who checks whether that's a real divergence or
> just a closed market? And when someone claims they caught one — how do you
> verify they really saw it? MirrorGap does both."

Show the overview dashboard: assets watched, active incidents, confirmed
count, critical/high. Click through to the radar — each blip is an RWA,
distance from center = divergence severity.

## 2. Asset detail + history (30s)

Click **NVDA** → per-wrapper gap table (`NVDAX` vs `NVDAon` vs the tokenized
aggregate), cross-wrapper dispersion, the reference panel:

- reference state `market_closed` — _"this is the honest part: a closed
  reference can't confirm a parity failure, so the engine calls it a price
  difference, not an alarm"_
- freshness chips: `fresh` / `aging` / `stale`
- the representation graph: asset → wrappers → issuers
- **history chart** — deviation over time, with the threshold bands; scrub
  the window selector (1h → all)

## 3. Incident lifecycle + replay (60s)

Events tab → open the NVDA dispersion incident.

- **Status timeline** — candidate → confirmed → escalated → peak → resolved.
  _"Every transition is recorded — not just 'there was an anomaly', but when
  it was first suspected, when it was confirmed, when it peaked."_
- **Press play** — the replay steps through frames: deviation chart marker,
  reference state, freshness, the exact gap measurements the engine saw at
  each moment.
- **Claim ledger** — every sentence tagged `observed` / `derived` /
  `supported_hypothesis` / `unknown`. _"The engine states what it measured.
  It never invents a cause."_

## 4. The Evidence Capsule (45s)

Click **⬡ Evidence Capsule**.

- Receipt + verification verdict + asset context + claim summary +
  provenance + limitations — one shareable bundle.
- Show `✓ VERIFIED`.
- **Tamper playground**: scroll to the receipt JSON, change one character in
  a number or the symbol, hit _verify this JSON_ →
  `✗ INVALID — receipt hash mismatch`. _"Anyone can check this offline —
  canonical JSON, SHA-256, no trust required."_

CLI equivalent in a second terminal:

```bash
mirrorgap receipt MG-20260919-0001 --verify   # ✓ verified
```

## 5. Watchlist + alerts (20s)

Watchlist tab → add an asset with custom thresholds (`0.5,1,2,4`).

> "Per-asset thresholds, persistent across restarts. And alerts are
> lifecycle-aware — a webhook fires on confirmation and on escalation, but
> repeated scans of the same incident don't spam you. Discord and Telegram
> work the same way."

## 6. Live CMC proof (30s)

```bash
export CMC_API_KEY=...
mirrorgap doctor       # plan + capabilities + credits
mirrorgap cmc-proof    # real calls: endpoint, status, credits, latency
```

> "Every call is logged — endpoint, HTTP status, credit count. Nothing is
> mocked in live mode, and fixture mode can never pretend to be live."

Diagnostics tab shows the same log in the UI.

## 7. MCP (20s)

> "The same engine is an MCP server — agents get `mirrorgap_timeline`,
> `mirrorgap_capsule`, `mirrorgap_verify_receipt`, not just `get_price`."

## Closing line

> "Crypto has dashboards. Tokenized assets need an integrity layer.
> MirrorGap is the system that watches whether tokenized reality still
> agrees with reality — and it can prove what it saw."
