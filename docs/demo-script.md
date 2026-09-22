# MirrorGap demo script (about 5 minutes)

## Prepare

Use a dedicated fixture instance. In PowerShell, from the repo root:

```powershell
$env:MIRRORGAP_DATA_MODE = 'fixture'
$env:MIRRORGAP_FIXTURE_SCENARIO = 'incident_cycle'
$env:MIRRORGAP_SEED_TICKS = '31'
$env:MIRRORGAP_DB_PATH = ':memory:'
$env:MIRRORGAP_NO_LOOP = '1'
Set-Location apps/web
node --import tsx src/server.ts
```

Open http://localhost:8787. Keep the FIXTURE banner visible throughout. These are synthetic incident observations, not a discovered market event. Use the actual IDs returned by this instance; do not hardcode historical event IDs.

## 1. Ask a concrete question (30 seconds)

“A wrapper differs from its peers. Is that a real underlying-price gap, a stale reference, or simply disagreement between wrappers? What can I prove?”

Overview → Radar → NVDA. Show prices, issuer names, measured time and underlying-market heuristic. Explain that CMC's aggregate is a tokenized-market reference, not the stock-market price.

## 2. Complete an investigation (75 seconds)

On the asset page, open Investigation Workbench. Show each wrapper's gap versus the aggregate and versus the median of the _other_ wrappers. Explain that two wrappers cannot tell us which one is wrong, and even more wrappers share the same data provider.

Read the disposition and next evidence steps. If the snapshot has aged, show the request to refresh; do not hide it. Demonstrate the underlying quote form using an explicitly synthetic price, source `Demo synthetic quote`, URL `https://example.com/quote`, an ISO timestamp and explicit units per token. First select **Live analyst quote** against this fixture: comparison must be **blocked** for data-mode mismatch. Change to **Synthetic fixture**. A closed/unknown underlying market or stale timestamp should still block it; this is expected. Automated unit tests cover an open-session indicative comparison at a pinned clock.

An accepted result is only indicative: the source and ratio are user supplied, and wrapper source timestamps are unavailable. Never describe this as authenticated cash-market parity.

Export review JSON. In a terminal:

```bash
node scripts/verify-review.mjs <downloaded-review.json>
```

The hash must match. Change a price in a copy; verification must fail. No server is needed for this check.

## 3. Show incident evolution (45 seconds)

Events → a confirmed or resolved incident → timeline. Play the recorded frames. Point out the claim kinds: observed, derived, supported hypothesis, unknown. The timeline is historical; confirmations are repeated observations, not independent source attestations.

## 4. Prove more than a matching hash (75 seconds)

Open the Evidence Capsule. Receipt measurements are frozen at issuance; lifecycle status can be newer. Click **Audit calculations**: expect AUDIT PASS on a newly generated receipt. This checks the hash plus gap/dispersion arithmetic and evidence links.

Edit a metric in the tamper JSON; click verify and audit to show failure. For the stronger demonstration, the automated `pnpm demo:workbench` flow deliberately alters a gap and recomputes the hash: ordinary integrity verification passes, but arithmetic audit fails. No claim of source authenticity follows from either check.

Download the capsule and run:

```bash
pnpm mirrorgap audit --file <downloaded-capsule.json>
```

The CLI works offline and returns a nonzero exit code for a failed audit.

## 5. Give the same evidence to an agent (30 seconds)

MCP workflow: `mirrorgap_scan` → `mirrorgap_workbench({rwaId:2})` → `mirrorgap_list_events` → `mirrorgap_capsule` → `mirrorgap_audit_receipt`.

Show the JSON policy and limitations. The agent may summarize evidence; it cannot reasonably claim verified underlying parity. The response does not authorize a trade. No LLM, fabricated chat or real trade is necessary to demonstrate the tools.

## 6. Separate live API evidence (30 seconds)

Only when an actual CMC key is configured locally, run from apps/web:

```bash
node --import tsx ../../scripts/cmc-evidence.ts
```

This captures a validated actual `quotes/latest` response to ignored `data/cmc-live-evidence.json`, including endpoint, params, retrieval time and credits. Show relevant response fields alongside `packages/cmc/src/normalize.ts`. The script explicitly skips without a key. Never substitute docs examples or fixture outputs for real-call evidence. The upgrade session had no configured key, so a live capture remains required before submission.

Closing: “MirrorGap turns a suspicious price difference into an inspectable investigation, and makes the boundary of the evidence visible.”

## Rehearsal

`pnpm demo:workbench` checks the deterministic review/export/audit story. `pnpm demo:check` checks HTTP. `pnpm e2e` exercises the browser including refusal and audit. See `upgrade-validation.md` for actual outcomes. Publishing a video and the required X post are separate submission tasks.
