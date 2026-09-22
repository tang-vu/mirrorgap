# MirrorGap optical observatory

The zero-build vanilla application retains the TypeScript/SQLite/REST/SSE architecture and all three comparison bases. The reviewed baseline and fetched `origin/main` were both `70dbc63`; there were no local changes to reconcile.

## Design system

Cool mineral paper `#EFF3F4`, blue-black `#15232E`, teal `#0F766E`, vermilion `#C34736`, and amber uncertainty replace the former warm-paper/forest treatment. System sans-serif display type, tabular measurements, registration brackets and numbered annotations establish an optical registration bench. `style.css` owns primitives and application chrome; `desk.css` owns bench and workspace compositions. Both were rewritten rather than adding a theme override file. No external font, raster-image dependency, WebGL, or frontend build is required.

The original `optical-bench.svg` is explicitly a concept diagram, not market measurements. The interactive HTML/CSS bench and evidence registrations are generated from actual API measurements, with selectable text and native controls. There is no decorative price animation.

## Reference study

- [Bearplus](https://bear.plus/): text/content accessible, including its concise product-first positioning and linked projects. A direct headless-browser navigation timed out after 25 seconds; no full visual/animation review is claimed.
- [Heron](https://heronaiapp.com/): readable product narrative connects observation, issue annotation, review and action. Browser navigation completed, but the captured viewport remained the textured loading surface; the working interactive site could not be fully visually assessed.
- [United Carriers](https://unitedcarriers.com/): page content accessible through the web reader; direct headless navigation timed out after 25 seconds. Its complete motion treatment was not observed.

The design takes the idea of a continuous, domain-specific explanatory journey and authors its own optical language. No reference artwork or code was copied. Local access records are in ignored `data/design-references/`.

## Working journeys

- **Overview:** select an available asset and a wrapper registration. One symmetric signed scale is shared across available assets; exact prices, currency, gap, measurement time, freshness at scan, market state and mode remain visible. The ledger and marks select the same wrapper. Missing comparisons are absent. CMC is always called a tokenized aggregate, never a true underlying-price plane.
- **Observe → Detect → Investigate → Prove:** the selected asset/wrapper carries into a retained incident, historical frame and issuance receipt. Earlier frame and issuance values are separately labelled; current observations are not retroactively inserted into history. Assets without incidents have an explicit absence state. Desktop chapter navigation sticks only inside this bounded section. Buttons and all chapters remain usable on mobile/reduced motion; no scroll hijacking or automatic navigation.
- **Observation desk:** search, ordering and selected wrapper persist across refresh/navigation/back. Marks are touch/keyboard buttons with an exact-value inspector; asset names and incident IDs are native links.
- **Asset workspace:** History, Comparisons, Representations and Incidents are accessible tabs with arrow/Home/End keys. Selected wrapper, comparison basis and source context are visible above them; a compact desktop side rail retains that context without covering controls. Changing a history window fetches only history and preserves quote inputs. Charts label percent/UTC and missing values; an exact historical ledger is available.
- **Underlying comparison:** quote details, explicit per-wrapper unit mappings and review are numbered fieldsets. A calculation preview never claims acceptance. Server refusal reasons appear beside relevant inputs and in the per-wrapper result. Values survive refused/failed submissions. The policy’s age/separation limit is shown. Source URLs are never visited.
- **Replay:** native frame buttons, previous/next, play/pause and arrow/Home/End controls share one selected index. Frame time, values and chart marker stay synchronized. Current lifecycle status is separate. Timers stop on route cleanup, hidden documents, or end of replay.
- **Capsule:** distinct schema/hash, arithmetic, signature and attribution outcomes replace the broad VERIFIED headline. Claims retain categories and evidence references. Observations are listed from the fixed issuance receipt; current lifecycle peak is explicitly separate. Export, permalink, raw receipt, reset and editable tamper/audit tools remain available.
- **Watchlist:** four labelled thresholds, inline ascending-value validation and pending/saved/failed states. The additive `canMutate` response is advisory only; the existing server guards still authorize every write. Public readers and missing-capability clients are blocked without exposing a token.
- **Diagnostics/about:** source mode, plan-gated market-pairs, scan outcomes, attribution, verification limits and all three comparison bases are explicit. A connected SSE transport never means live market data.

## Validation and reproduction

Use an installed Chromium browser explicitly on this machine:

```powershell
$env:PUPPETEER_EXECUTABLE_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
# Optional: select a known-free port; otherwise the runner chooses one.
$env:MIRRORGAP_E2E_PORT = '18893'
pnpm e2e
```

The runner launches Node directly from `apps/web`, creates an independent in-memory SQLite database, seeds 31 deterministic fixture scans and disables the scan loop. Its test-only clock begins at `2026-09-18T15:00:00Z` and advances normally so a valid open-session comparison is reproducible at any real time. Production never imports that clock. The test clock refuses non-fixture/non-memory configuration.

The baseline ran 25/25 checks using Edge and captured the prior overview/desk/investigation. Default Chrome navigation timed out; Edge also had intermittent startup navigation timeouts on this machine. A skipped or failed browser run is not counted as validation. Final validation uses an isolated Chrome Headless Shell 153.0.8010.52 downloaded under ignored `data/browser/`, explicitly selected with `PUPPETEER_EXECUTABLE_PATH`. The runner preflights the port and binds only to loopback.

The expanded suite checks actual UI navigation, wrapper selection, filter/back retention, quote mode refusal and acceptance, history/form preservation, JSON exports, keyboard replay and route cleanup, arithmetic audit, tamper rejection, threshold validation/save, every route, explicit read-only/unknown-capability states, API failure, empty/missing/stale observations, disconnected SSE, reduced motion, viewport widths 360/390/768/1440/1920 and 200% CSS zoom. Failure-state responses are deliberately intercepted test inputs and are not production data. Authorization is also tested against a separate real token-guarded API instance.

Artifacts: `data/design-before/captures/` (baseline), `data/e2e/` (new overview, investigation, manual form, replay and capsule desktop/mobile captures; exported review and performance resource timings). These directories are ignored. Checked-in comparison captures are in `docs/ui/`.

Completed gates and measured results are recorded in `docs/observatory-validation.md`. A local browser/fixture run is not a formal accessibility certification, field performance study, Safari/Firefox test, live-provider validation, or public deployment.

## Preserved boundaries

Core comparison formulas, quote rejection policy, canonicalization, signatures and claim categories are unchanged. The radar API fixes an existing presentation bug: a measured zero is now `0`, while no measurements remain `null`; gap currency is also included. Watchlist adds `dataMode` and `canMutate` without removing fields. No independent feed, FX conversion, corporate-action adjustment, corroboration, issuer-backing claim or trade capability is introduced.

No PM2 restart, tunnel change, production database operation, credential change, paid CMC scan or deployment command is part of this work. Existing hosted servers that do not yet return the new advisory watchlist capability intentionally show the blocked-capability state. Static assets are served from the shared checkout by the existing host; updating those files can be visible without a process restart.
