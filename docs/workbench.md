# Investigation Workbench contract

The workbench reviews the latest stored snapshot. It makes no additional CMC call, mutates no state, sends no alerts and never visits a supplied source URL. The current UI lives on **Radar → asset → Investigation Workbench**.

## Three comparisons with different meanings

1. **Wrapper versus CMC aggregate:** existing tokenized-market reference. Not an underlying cash price.
2. **Wrapper versus other wrappers:** median excludes the wrapper being examined. Same currency only. Two wrappers cannot establish which one is wrong; even many wrappers remain observations from one provider.
3. **Wrapper versus supplied underlying:** optional analyst quote with an explicit units-per-token mapping. Expected token price = underlying price × underlying units per token. Gap = (token price − expected token price) / expected token price × 100. No FX conversion, corporate-action adjustment or inferred ratio.

Underlying comparison refuses mismatched assets, currencies or data modes, missing unit mappings, stale/future observations, time separation beyond the configured age window, incomplete evidence, and non-open/non-continuous underlying market state. Positive finite inputs and unique mappings are validated by Zod. The age window is the configured `agingSeconds`; the response includes the actual policy.

Even accepted comparisons are **indicative**, never source-authenticated. In CMC's current token payload, retrieval timestamps cannot prove simultaneous trading. The source URL is attribution only: HTTPS, no credentials, query or fragment. Do not enter private data in source labels. Inputs are returned in the review so another analyst can inspect the assumptions; they are not persisted to the observation store.

## Interfaces

| Interface | Operation                                                                    |
| --------- | ---------------------------------------------------------------------------- |
| REST      | `GET /api/v1/assets/:rwaId/workbench`                                        |
| REST      | `POST /api/v1/assets/:rwaId/compare` with underlying quote JSON              |
| REST      | `POST /api/v1/receipts/audit` with a receipt                                 |
| CLI       | `pnpm mirrorgap workbench NVDA --fixture --db <path>`                        |
| CLI       | `pnpm mirrorgap workbench NVDA --underlying quote.json --db <path>`          |
| CLI       | `pnpm mirrorgap audit --file receipt-or-capsule.json` (no API key/DB needed) |
| MCP       | `mirrorgap_workbench({rwaId: 2, underlying?: quote})`                        |
| MCP       | `mirrorgap_audit_receipt({receipt})`                                         |

Read-only computation POSTs are body-capped (64 KiB) and rate-limited; they require no scan token. Errors use the existing API envelope. Underlying inputs must match the strict schema; malformed fields return 400. The CLI audit returns nonzero for failed verification. The workbench always prints JSON.

Example **synthetic** quote structure (not a live price; timestamp must align with the actual fixture snapshot to compare):

```json
{
  "rwaId": 2,
  "price": 100,
  "currency": "USD",
  "unit": "share",
  "observedAt": "2026-09-18T15:00:00.000Z",
  "source": "Synthetic unit test quote",
  "sourceUrl": "https://example.com/quote",
  "dataMode": "fixture",
  "mappings": [{ "cryptoId": 36992, "underlyingUnitsPerToken": 1 }]
}
```

## Portable review and audit

Review JSON contains the exact retained observations addressed by the snapshot, wrapper calculations, policy, analyst quote if supplied, limitations, and a `reportHash`. Hashing sorts object keys recursively, preserves array order and serializes finite JSON values without whitespace. Remove `reportHash`, apply that canonicalization, then compute SHA-256. `node scripts/verify-review.mjs review.json` does this without the server. This is an integrity check, not a trusted timestamp or publisher signature. Workbench reports and incident receipts have separate schemas.

Receipt audit adds checks beyond existing schema/hash/signature verification: gap arithmetic, observations matching the gap inputs, dispersion range/median/count, calculation-trace coverage/formulas, dataMode consistency and claim evidence links. It does not validate natural-language meaning, all quality factors, source truth, redemption rights, issuer solvency or oracle authenticity. Legacy receipts lack per-observation cryptoId; the audit documents its weaker price/currency matching for those receipts. New receipts include wrapper IDs in hashed observation details.

The agent policy is deliberately bounded: summarize current retained evidence when blockers are absent; never assert verified underlying parity or execute a trade. This is output guidance, not a sandbox capable of preventing a third-party agent from ignoring it.

## Current versus historical evidence

A stored receipt is immutable evidence from issuance, not a live quote. Capsule divergence now comes from the same receipt snapshot as its prices/freshness; lifecycle status and peak can advance afterward and are labelled separately. A stale workbench asks for a fresh scan; this does not invalidate an old receipt's hash. Repeated CMC retrievals are not independent corroboration.

Remaining work: a licensed automatic underlying-price provider, trustworthy wrapper conversion/corporate-action metadata, holiday/early-close calendars, provider-authenticated capture, and observed user research. None is represented as delivered.
