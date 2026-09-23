# Live CoinMarketCap RWA API evidence

Captured on **23 September 2026 at 08:15:17 UTC** with a locally configured CMC API key. This is a real API response, separate from the public synthetic fixture demo. No key, request header, account response, or private configuration is included here.

## Code and call

The call is made by [`scripts/cmc-evidence.ts`](../scripts/cmc-evidence.ts) through [`packages/cmc/src/adapter.ts`](../packages/cmc/src/adapter.ts) and [`packages/cmc/src/client.ts`](../packages/cmc/src/client.ts). The client sends `X-CMC_PRO_API_KEY` as a private header. The adapter validates the response with Zod before exporting it.

```text
GET /v5/real-world-assets/quotes/latest
symbol=NVDA&convert=USD&skip_invalid=true
HTTP 200 · credit_count=1
```

Run locally from `apps/web` after placing the key in the ignored root `.env.host`:

```bash
node --env-file=../../.env.host --import tsx ../../scripts/cmc-evidence.ts
```

The full validated capture is written to ignored `data/cmc-live-evidence.json`. It is excluded from Git so the published excerpt can be reviewed separately.

## Selected response fields

The excerpt below is from that capture. Prices are historical observations at the stated timestamps, not current prices or an independent underlying quote.

```json
{
  "dataMode": "live",
  "endpoint": "/v5/real-world-assets/quotes/latest",
  "retrievedAt": "2026-09-23T08:15:17.231Z",
  "params": { "symbol": "NVDA", "convert": "USD", "skip_invalid": "true" },
  "creditCount": 1,
  "response": [
    {
      "rwa_id": 2,
      "symbol": "NVDA",
      "asset_type": "stock",
      "quotes": [
        {
          "symbol": "USD",
          "average_tokenized_price": 229.0677214889808,
          "last_updated": "2026-09-23T08:13:59.000Z"
        }
      ],
      "tokens": [
        { "symbol": "NVDAX", "crypto_id": 36992, "price": 229.27875621100821 },
        { "symbol": "NVDA.D", "crypto_id": 28616, "price": null },
        { "symbol": "NVDAon", "crypto_id": 38093, "price": 229.00127327314348 }
      ]
    }
  ]
}
```

The excerpt omits other wrapper and venue fields. The local capture was checked for the configured key and did not contain it. A separate live NVDA scan completed with one asset and one snapshot after successful `map`, `quotes/latest`, and `info` calls (all HTTP 200). No live anomaly was observed in that scan.

CMC's aggregate is calculated from tokenized representations and is **not** an independent cash-market price. The public site remains in clearly labelled fixture mode; this live call proves API integration, not that the public incident history is live.
