# Demo checklist

## Before recording / judging

- [ ] `pnpm install` clean on a fresh checkout
- [ ] `pnpm mirrorgap scan --fixture` prints the anomaly table
- [ ] `pnpm --filter @mirrorgap/web dev` → http://localhost:8787 loads
- [ ] Mode badge shows **fixture** (or **live** with `CMC_API_KEY`)
- [ ] Radar renders blips; NVDA/TSLA show dispersion
- [ ] Click an asset → gaps, dispersion, wrappers, graph render
- [ ] Open an event → claim ledger + receipt + `✓ verified`
- [ ] `pnpm demo:check` prints `PASS`
- [ ] `pnpm test` all green
- [ ] `mirrorgap receipt <id> --verify` → verified
- [ ] No `CMC_API_KEY` committed anywhere (`git grep -i cmc_api_key` shows only `.env.example` placeholder)

## Live mode (needs CMC_API_KEY)

- [ ] `mirrorgap doctor` shows plan + capabilities
- [ ] `mirrorgap cmc-proof` prints `/v1/key/info` + call diagnostics
- [ ] market-pairs badge shows correct capability state
- [ ] one `mirrorgap scan` completes and persists events

## During the demo

- [ ] Show market-closed honesty (equities pre/post US hours → `price_difference`, not `parity_gap`)
- [ ] Show the claim ledger labels — especially `supported_hypothesis` and `unknown`
- [ ] Show receipt hash + live `--verify`
- [ ] Mention fixture/live labeling explicitly (judges look for it)

## If something breaks

- UI won't load → `curl localhost:8787/api/v1/health`; fallback: run the CLI demo path only
- Live API fails → switch to `--fixture` and say so; provenance records already label it
- Port busy → `PORT=8888 pnpm --filter @mirrorgap/web dev`
