# Demo checklist

## Before recording / judging

- [ ] Follow the updated PowerShell setup and five-minute story in `demo-script.md`
- [ ] `pnpm demo:workbench` passes; exported review verifies with `scripts/verify-review.mjs`
- [ ] Workbench shows peer comparisons, missing evidence and an explicit data mode
- [ ] Underlying comparison refuses mismatched mode/currency and missing unit mappings
- [ ] Receipt arithmetic audit catches a wrong metric even when its hash is recomputed

- [ ] `pnpm install` clean on a fresh checkout
- [ ] `pnpm mirrorgap scan --fixture` prints the anomaly table
- [ ] `MIRRORGAP_SEED_TICKS=31 pnpm dev` (or `docker compose up --build`) → http://localhost:8787 loads seeded
- [ ] Mode badge shows **fixture** (or **live** with `CMC_API_KEY`); fixture banner visible
- [ ] Overview dashboard shows counters; registration bench renders selectable wrappers; NVDA/TSLA show dispersion
- [ ] Click an asset → gaps, dispersion, wrappers, graph, history chart render
- [ ] Open an event → claim ledger + receipt + `✓ verified`; timeline replay advances on play
- [ ] Capsule view → separate integrity / arithmetic / signature / attribution outcomes; tamper one char in the JSON → `✗ INVALID`
- [ ] Watchlist has four labelled thresholds; public readers see read-only controls; diagnostics shows call log + alert config
- [ ] `pnpm demo:check` prints `PASS`; `pnpm e2e` prints `PASS` with actual browser execution (a skip does not validate the UI)
- [ ] `pnpm test` all green; `pnpm typecheck` clean; `pnpm format:check` clean
- [ ] `mirrorgap receipt <id> --verify` → verified
- [ ] No `CMC_API_KEY` committed anywhere (`git grep -i cmc_api_key` shows only `.env.example` placeholder)

## Live mode (needs CMC_API_KEY)

- [ ] Capture a real RWA response with `scripts/cmc-evidence.ts`; inspect ignored `data/cmc-live-evidence.json`
- [ ] Record code + actual response; no fixture/docs example substituted for the live-call requirement

- [ ] `mirrorgap doctor` shows plan + capabilities
- [ ] `mirrorgap cmc-proof` prints `/v1/key/info` + call diagnostics
- [ ] market-pairs badge shows correct capability state
- [ ] one `mirrorgap scan` completes and persists events

## During the demo

- [ ] Explain that CMC aggregate is not an independent underlying quote
- [ ] Describe accepted manual underlying comparisons as indicative and unauthenticated

- [ ] Show market-closed honesty (equities pre/post US hours → `price_difference`, not `parity_gap`)
- [ ] Show the claim ledger labels — especially `supported_hypothesis` and `unknown`
- [ ] Replay an incident timeline — the "show your work" moment
- [ ] Show receipt hash + live `--verify`, then the capsule tamper playground
- [ ] Mention fixture/live labeling explicitly (judges look for it)

## If something breaks

- UI won't load → `curl localhost:8787/api/v1/health`; fallback: run the CLI demo path only
- Live API fails → switch to `--fixture` and say so; provenance records already label it
- Port busy → `PORT=8888 pnpm --filter @mirrorgap/web dev`
