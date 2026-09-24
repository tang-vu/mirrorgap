# X launch draft (not published)

MirrorGap investigates tokenized-asset price gaps with CMC RWA data: compare wrappers, challenge the reference, and audit the evidence.

Demo: https://youtu.be/rqIeHMNVLhk
Submission: <dorahacks-url>
#BuildwithCMC

## Optional follow-up

CMC supplies wrapper identities, prices and the tokenized aggregate. The aggregate is not an independent underlying price. MirrorGap makes that boundary explicit, accepts attributed analyst quotes with unit mappings, and exports the inputs for review.

A matching hash is not enough: MirrorGap also recalculates receipt arithmetic. The demo shows a modified metric with a newly valid hash still failing audit. Human UI, REST, CLI and MCP use the same deterministic core.

Repo: https://github.com/tang-vu/mirrorgap

Replace the submission placeholder only after that artifact exists. No real market incident, real trade, user adoption or source authenticity is claimed by the fixture demo.
