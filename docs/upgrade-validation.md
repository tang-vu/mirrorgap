# RWA workbench upgrade: evidence and limitations

Validated locally on Windows, Node 24.14.1 / pnpm 12.4.2, 22 September 2026.

## Delivered

- Community research covering nine award-winning projects from several hackathons, with organizer sources, explicit award categories and a translation/priority matrix: [research](competitive-research.md).
- Snapshot-bound wrapper review with leave-one-out peer median, provenance, freshness blockers and next evidence steps.
- Optional analyst-supplied underlying comparison, explicit per-token unit ratios, strict input validation and refusal reasons. No automatic underlying-price feed is claimed.
- Exported review with included observations and standalone hash verifier.
- Receipt arithmetic/evidence audit through web, REST, CLI and MCP. A rehashed false metric fails the audit even when hash verification passes.
- Receipt fixes: correct wrapper names, explicit wrapper IDs/venue context in evidence, resolved calculation input references, safe malformed-signature rejection and issuance-time capsule divergence.
- Updated OpenAPI, README, API feedback, submission draft, X draft and [demo script](demo-script.md). No external message was sent or submission published.

## Checks

| Check                          | Result                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`               | Passed across all packages                                                                                          |
| `pnpm test`                    | **107/107 passed**: core 56, CMC 14, storage 4, runtime 5, HTTP 20, MCP 8; CLI has no unit suite                    |
| `pnpm build`                   | Passed all library/app TypeScript emit checks                                                                       |
| `pnpm demo:check`              | 9/9 HTTP checks passed                                                                                              |
| `pnpm demo:workbench`          | 7/7 deterministic end-to-end checks passed                                                                          |
| Standalone review verification | Exported review verified without a server in the workbench demo                                                     |
| Browser E2E                    | **Not passed:** Chrome and Edge document navigation timed out after 30/60 seconds, before the new UI assertions ran |
| Live CMC capture               | Explicitly skipped: no `CMC_API_KEY` in process, app-local or root configuration                                    |

The synthetic demo pins an open session to 2026-09-18 15:00 UTC. It checks peer comparison, a unit-mapped indicative underlying comparison, live/fixture refusal, stale-review refusal, exported hash verification, a valid receipt audit, and an altered/rehashed metric rejected by audit. Files are in ignored `data/workbench-demo/`; they are not market observations or submission evidence of a real CMC call.

Browser investigation: startup/seed and local HTTP checks passed. Direct requests returned `app.js` and `js/util.js` with HTTP 200. Browser diagnostics nevertheless showed pending document/module requests; a captured frame showed the static shell before application initialization. Chrome, Edge and separate ports reproduced the timeout. A trial of preloaded static assets did not fix it and was removed. Root cause is **not established**, so this is not labelled an application pass or conclusively an environment-only bug. New workbench/refusal/audit browser assertions are committed for rerun on a healthy browser runner. `MIRRORGAP_E2E_PORT` can isolate its port; `PUPPETEER_EXECUTABLE_PATH` chooses the browser. Failure screenshots are in ignored `data/e2e/`.

## Local benchmark

The first attempt timed out waiting for server startup. A separate rerun completed using fixture data, 31 seed scans, 20 read requests per endpoint and 10 scan requests. These are local hot-path measurements, not production, external CMC latency, or a before/after speed claim.

| Endpoint           | p50 ms | p95 ms |
| ------------------ | -----: | -----: |
| POST scan          |    8.6 |   10.6 |
| GET radar          |    1.2 |    2.4 |
| GET asset          |    1.0 |    1.4 |
| GET history        |    2.2 |    3.4 |
| GET event          |    6.3 |   14.1 |
| GET timeline       |    2.7 |    5.8 |
| GET capsule        |    1.8 |   22.4 |
| GET receipt verify |    1.2 |    1.5 |
| GET overview       |    1.4 |    2.9 |

## Remaining limits and submission tasks

1. Capture a real RWA call with `scripts/cmc-evidence.ts` once a valid local key is available. The script exports only validated market response/provenance, not request credentials. Review that artifact before publishing it.
2. Supply a licensed, authenticated underlying feed and trustworthy unit/corporate-action mappings for autonomous underlying-parity monitoring. Today the optional quote is manual and remains indicative.
3. Confirm RWA-specific scoring in DoraHacks Tracks; direct access returned HTTP 405. General official criteria and the user-supplied Details text informed prioritization.
4. Record/publish the demo video, fill the submission/video placeholders and post the required X link. These have not been performed.
5. Hash/signature checks do not authenticate CMC source truth or issuer backing. An embedded public key needs a separate trusted identity channel. Old receipts missing evidence context may pass integrity while failing the stricter audit; they are never silently rewritten.
6. Market-hours logic is still a US-session heuristic, not a complete holiday/early-close calendar. Per-wrapper source timestamps, executable liquidity and redemption evidence remain unavailable.
7. No production deployment, user study, live anomaly, trading execution, product adoption or contest ranking is asserted.
