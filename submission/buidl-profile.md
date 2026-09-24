# DoraHacks BUIDL profile — MirrorGap

Prepared for **Build with CMC: API Hackathon**, **Real World Assets** track. Use this copy in the BUIDL creation form; the fuller submission text is in [dorahacks.md](dorahacks.md).

## Profile

**BUIDL (project) name:** MirrorGap

**BUIDL logo:** [mirrorgap-logo-480.png](assets/mirrorgap-logo-480.png) (480 × 480 PNG)

**Vision — Describe the problem which this project solves:**

> Tokenized real-world assets can have several wrappers whose prices disagree, while the underlying asset follows different market hours. A raw percentage gap leaves an analyst with a harder question: is the reference stale, are the wrappers diverging, or is there evidence of a genuine underlying-price difference? MirrorGap turns that ambiguity into a reproducible investigation. It uses CoinMarketCap RWA observations to compare wrappers, track incident history, label what the evidence can and cannot support, and export receipts and capsules whose hashes and arithmetic anyone can audit. Analyst-supplied underlying quotes require explicit provenance and unit mappings. The public demo uses clearly labeled synthetic fixture observations; a separate real CMC API call and reviewed response are documented in the repository.

**Category:** Choose the closest data/analytics or infrastructure category offered by the BUIDL profile form. Select **Real World Assets** as the hackathon track in the Submission step; the track and BUIDL category are separate fields.

## Links

**GitHub/Gitlab/Bitbucket:** https://github.com/tang-vu/mirrorgap

**Project website:** https://mirrorgap.tangvu.dev

**Demo video:** https://youtu.be/rqIeHMNVLhk

**Social link 1 (X):** https://x.com/tangvu_dev

**Social link 2 (optional YouTube channel):** https://www.youtube.com/@VanG_G — the channel returned as the publisher of the demo video.

## Submission notes

- **Hackathon:** Build with CMC: API Hackathon (September 2026)
- **Track:** Real World Assets
- **CMC endpoints:** `/v5/real-world-assets/map`, `/info`, `/quotes/latest`, `/assets/list`, `/issuers/list`, `/issuers`; `/market-pairs/list` is feature-detected and plan-gated. Details: [CMC API usage](../docs/cmc-api-usage.md).
- **Real API evidence:** [reviewed CMC response excerpt](../docs/cmc-live-evidence.md) and [`scripts/cmc-evidence.ts`](../scripts/cmc-evidence.ts). The hosted demo and video use fixture data.
- **API feedback:** [cmc-api-feedback.md](../docs/cmc-api-feedback.md).
- **X post:** Requires the finished DoraHacks submission URL; draft in [x-launch-post.md](x-launch-post.md). Do not present the draft as published.

Team member and contact fields must be filled from the account holder's own details; do not infer private names or contact data from the repository.
