# Observatory captures

The new [motion recordings and five-frame storyboard](../motion-scenes.md) document the three interactive apparatus scenes on desktop and mobile.

These are actual browser screenshots of independent synthetic fixture instances. They contain no live market data. Baseline captures precede the upgrade at `70dbc63`; fixture timestamps and selected observations can differ between runs, so these are visual comparisons, not a historical market series.

| Screen                 | Desktop, 1440 px                        | Mobile, 390 px                         |
| ---------------------- | --------------------------------------- | -------------------------------------- |
| Baseline overview      | [Before](before-overview-1440.png)      | [Before](before-overview-390.png)      |
| Baseline investigation | [Before](before-investigation-1440.png) | [Before](before-investigation-390.png) |
| Observatory overview   | [After](overview-1440.png)              | [After](overview-390.png)              |
| Asset investigation    | [After](investigation-1440.png)         | [After](investigation-390.png)         |
| Manual comparison      | [After](manual-comparison-1440.png)     | [After](manual-comparison-390.png)     |
| Incident replay        | [After](replay-1440.png)                | [After](replay-390.png)                |
| Evidence capsule       | [After](capsule-1440.png)               | [After](capsule-390.png)               |

The final captures follow NVDA (RWA 2), incident `MG-20260918-0006`, using 31 deterministic scans and reduced motion. The manual comparison is explicitly synthetic: 114.25 USD/share × 2 shares/token = 228.50 USD/token. Acceptance means indicative arithmetic passed the policy checks, not source authentication. Replay includes a lifecycle-only entry with no measurement frame; the interface says so. The capsule preserves the earlier issuance measurements.

Screens were inspected after rendering. Navigation wrapping, mobile chart/data containment, non-overlapping desk controls and the investigation side rail were refined during browser validation. See [exact checks and limits](../observatory-validation.md) and the [reproducible demo](../demo-script.md).
