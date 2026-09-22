# Optical observatory validation

Completed locally on 2026-09-22/23 against independent fixture instances. The starting checkout was clean at `70dbc63`, equal to fetched `origin/main`. No production database, PM2 process, tunnel, credential, core calculation, signature implementation or hosting configuration was changed. Existing servers serve static assets from this checkout, so file updates can appear without restarting a process. An older running API without the additive watchlist capability intentionally displays the blocked state.

## Completed checks

| Check                                | Actual result                                   |
| ------------------------------------ | ----------------------------------------------- |
| `pnpm format`, `pnpm format:check`   | Passed                                          |
| `pnpm typecheck`                     | Passed                                          |
| `pnpm test`                          | 109 tests passed                                |
| `pnpm build`                         | Passed                                          |
| `pnpm demo:check`                    | 9/9 HTTP checks passed                          |
| `pnpm demo:workbench`                | 7/7 comparison checks passed                    |
| `pnpm e2e`                           | 56/56 actual browser checks passed; not skipped |
| Offline exported review verification | Passed; canonical hash matched                  |
| `pnpm bench`                         | Completed against fixture data                  |

The baseline browser suite passed 25/25 using Edge. Final browser validation used Chrome Headless Shell **153.0.8010.52**, downloaded into ignored `data/browser/`. Installed Chrome and Edge intermittently stalled during initial navigation; those failed attempts are not counted as passing validation. No existing user browser or other application's server was stopped.

## Reproduce

```powershell
# Point to an installed Chromium executable, or this local isolated download.
$env:PUPPETEER_EXECUTABLE_PATH = (Resolve-Path 'data/browser/chrome-headless-shell/win64-153.0.8010.52/chrome-headless-shell-win64/chrome-headless-shell.exe').Path
pnpm e2e
node scripts/verify-review.mjs data/e2e/browser-review.json
```

The runner chooses a free loopback port unless `MIRRORGAP_E2E_PORT` is supplied, starts Node directly, creates a separate in-memory SQLite database, seeds 31 fixture scans and disables the scan loop. The test-only advancing clock starts during an open underlying session; it refuses non-fixture/non-memory configuration. It is never loaded by production. Browser absence may still skip the command: require the explicit 56/56 summary, not only exit code zero.

Coverage includes overview-to-asset navigation, exact wrapper selection, retained asset/story identity, search/sort/back state, quote rejection and accepted explicit unit mapping, preserved inputs after failures/history changes, JSON export, replay pointer/keyboard controls and cleanup, arithmetic audit, modified receipt rejection/reset, claim categories, four threshold inputs and save feedback, all routes, SSE refresh preservation, public read-only and unknown capabilities, empty/missing/stale data, API failure and disconnected transport. Failure states use clearly scoped browser response interception. A separate real token-guarded API test checks mutation refusal and absence of token disclosure. Presentation interactions do not add scans.

Responsive checks ran at 360, 390, 768, 1440 and 1920 px, with reduced motion and 200% CSS zoom. This is not a full screen-reader audit, native browser zoom certification, Safari/Firefox certification or live-provider test. [Checked-in captures](ui/README.md) show the five principal screens on desktop and mobile. The [demo script](demo-script.md) provides the human walkthrough.

## Measurements and limits

The production frontend remains zero-build and uses no external fonts or WebGL. Its complete shipped HTML/CSS/JS/SVG payload is **144,951 bytes**, including lazy routes (47,913 bytes summed gzip estimate). This excludes OpenAPI documentation and API responses. The local server serves uncompressed files; the gzip estimate is not an observed transfer size. Byte counts describe LF-normalized files before Git's Windows checkout conversion.

In the final browser run, registration selection to two animation frames took **16 ms**. Cold local DOMContentLoaded took **18.37 seconds** on this busy Windows host, with several static requests showing multi-second delays. This is a real limitation of the measured run, not a production speed claim or Core Web Vitals result. Resource timings remain in ignored `data/e2e/performance.json`.

Fixture HTTP benchmark, 20 samples per endpoint (10 scans), p50/p95 milliseconds: scan 9.5/12.7; radar 1.3/2.9; asset 1.0/1.6; history 2.5/7.6; event 6.6/20.6; timeline 2.2/4.1; capsule 1.8/3.2; verify 1.4/2.2; overview 1.4/2.2. These are local fixture API timings, not upstream or field performance.

Reference content from Bearplus, Heron and United Carriers was readable, but full visual access was incomplete: Bearplus/Carriers browser navigation timed out and Heron remained on a loading surface. See the [design record](frontend-design.md) for exact access limits. All delivered graphics and compositions are original.

Logs, exported JSON, baseline working copies and the isolated browser live under ignored `data/`. No secrets, databases or downloaded browser binaries belong in the commits.
