# MirrorGap research desk

The frontend is a working, dependency-free application served by `apps/web`, not a mockup. This design uses warm paper, dark green ink, restrained vermilion, editorial serif headlines and tabular data. The two separated frames in the mark represent the asset and its tokenized representations.

## Product flow

1. **Overview:** real engine counts, a signed divergence field, the largest observed aggregate gap and an incident ledger. Every dot comes from an actual snapshot gap. Fixture observations remain prominently labelled synthetic.
2. **Observation desk:** filter by symbol/name or sort by gap/name. The register retains reference freshness, underlying-market state and severity. Missing comparisons are absent, never plotted as zero.
3. **Investigation:** scan the gap, dispersion and freshness readings, expand reference context, then use **Review the evidence** to jump directly to the workbench. History, issuer representations and incident records remain available.
4. **Evidence:** review peer comparisons, optionally challenge them with an attributed underlying quote, export JSON, then follow an incident to its capsule for integrity and arithmetic checks.

## Visual and interaction decisions

- The divergence field replaces the polar radar's arbitrary angles with a shared symmetric signed scale. Vermilion means above aggregate; blue means below aggregate. These are directions, not severity or buy/sell signals. Exact wrapper values are in the investigation table; desktop dot tooltips also expose them.
- The CMC tokenized aggregate is explicitly distinct from an independent underlying price. No decorative time series, invented performance figures or implied verified depeg.
- Native links and buttons, visible focus, skip-to-content, `/` to search, Escape to dismiss search, and reduced-motion support.
- Background refresh preserves an active filter or focused control. Stale route requests cannot replace a newer rendered page.
- Mobile layouts stack the investigation panel and metrics; dense tables scroll within their panels, not the page. Local system fonts avoid third-party requests and rendering delays.
- `style.css` contains component primitives; `desk.css` supplies the research-desk theme and responsive composition. SVG charts use matching semantic colors.

## Review and reproduction

Run `pnpm e2e` to boot an isolated in-memory fixture server, execute the browser flow and capture desktop/mobile screenshots in ignored `data/e2e/`. The script supports `PUPPETEER_EXECUTABLE_PATH` and `MIRRORGAP_E2E_PORT`.

Screenshots include overview, radar, and the investigation workbench. Checks cover responsive page width at 390 px, keyboard search, filter results, empty state, sorting, evidence focus, quote-mode refusal, receipt audit and tamper rejection. This is functional and visual review, not a formal accessibility certification or user study.

No live CMC call or production deployment was performed as part of this design update.
