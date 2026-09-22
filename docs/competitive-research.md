# Community winner research and MirrorGap upgrade decision

Research date: 22 September 2026. Baseline: commit `65f4e7f`.

## Evidence and scope

This is a cross-community sample, not a history of the owner's projects. It covers ETHOnline, Superhack, ETHGlobal Cannes, Prague, San Francisco and Lisbon, plus Chainlink Block Magic. No ownership filter was used. Keryx's first-place result was supplied by the user, but no independently verified source was found in this research; it is not used as award evidence.

Awards below are confirmed by organizer-hosted showcase award sections or the organizer's results announcement. Sponsor prizes, overall prizes and finalist status are distinct. Technical descriptions on showcase pages are team-authored claims, not independent code audits. We did not run these projects, watch all demo videos, establish production adoption, or obtain judges' reasoning. **Demo moments below are our proposed adaptations inferred from documented workflows, not claims about what judges saw or why projects won.** No external code, branding or assets were copied.

## What was actually present before the upgrade

Source inspection found a substantial implementation, not just a pitch:

| Capability          | Implementation evidence                                                           | Actual boundary                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| CMC ingestion       | `packages/cmc/src/adapter.ts`, `schemas.ts`, `normalize.ts`                       | Validated RWA quotes, metadata, issuer identities, capability detection; aggregate is tokenized-market data, not a cash-market quote |
| Detection           | `packages/core/src/engine.ts`, `parity.ts`, `dispersion.ts`, `freshness.ts`       | Deterministic gaps, dispersion, market-hours heuristic and quality factors                                                           |
| Incident loop       | `packages/runtime/src/runtime.ts`, `packages/core/src/lifecycle.ts`               | Persistent candidates, confirmations, resolutions and transitions; repeated retrieval is not independent source corroboration        |
| Investigation       | `packages/core/src/investigation.ts`                                              | Observed/derived/hypothesis/unknown claims; no demonstrated causal inference                                                         |
| Evidence            | `receipt.ts`, `capsule.ts`                                                        | SHA-256, optional Ed25519, export and tamper playground; hash verification did not recompute arithmetic                              |
| Human and agent use | `apps/web`, `apps/cli`, `apps/mcp/src/tools.ts`                                   | Working views, HTTP, CLI, 12 MCP tools; not a demonstrated production agent deployment                                               |
| Demo                | `packages/runtime/src/seed.ts`, `scripts/demo-check.mjs`, `scripts/e2e-smoke.mjs` | Scripted fixture lifecycle with explicit dataMode; not live-market performance evidence                                              |

Important baseline findings: dispersion labels incorrectly parsed symbols from observation IDs; malformed embedded signature keys could throw; capsule's current divergence was mixed with issuance-time evidence. The upgrade fixes these. The baseline's strongest missing product step was answering **what may I conclude, what evidence is missing, and can I check the calculation myself?**

## Official competition fit

[CMC's official event page](https://coinmarketcap.com/api/resources/api-hackathon/) confirms the RWA track, submission artifacts and published general scoring: working product 30, usefulness 25, API use 20, code/docs 15, presentation 10. The supplied DoraHacks Details text agrees. The [DoraHacks Tracks page](https://dorahacks.io/hackathon/coinmarketcap-api-202609/tracks) returned HTTP 405; **RWA-specific weighting has not been independently checked**. We do not claim these are verified track-specific weights.

The implementation concentrates on working investigation and verifiable outputs. Submission still needs a public repository, working demo/video, explicit endpoints, real API call code/response, API feedback, RWA selection and an X post linking the submission/video with `#BuildwithCMC`. Existing work must identify the new CMC integration. No score, ranking or winning probability is predicted.

The [official RWA API reference](https://coinmarketcap.com/api/documentation/pro-api-reference/real-world-assets) describes `quotes/latest` as tokenized aggregate values, individual tokens and TradFi market context; its example does not provide an independent underlying cash price. CMC is essential to identity and both aggregate/peer analysis, but those prices cannot authenticate underlying parity. Its documented quote refresh is 60 seconds; re-reading a cache must not be sold as independent market confirmation.

## Reference projects: facts and transferable mechanisms

### AssetSphere — RWA and AI

**Source:** [ETHGlobal showcase](https://ethglobal.com/showcase/assetsphere-0xcfo). Award: Artificial Superintelligence Alliance, Innovator's Edge, first place at ETHGlobal Cannes. The team describes real-estate API inputs (RentCast/Zillow), AS1/Fetch.ai evaluation of location/value/default risk, and LayerZero propagation across testnets.

**Our analysis:** The useful mechanism is traceable external context attached to an asset, not adding an LLM score. Its documented workflow suggests a demo where changing an external observation changes the asset assessment. For MirrorGap, let an analyst supply an attributed underlying quote and unit mapping; visibly reject incompatible data. The value is a reproducible comparison with explicit uncertainty. We do not transfer its valuation or cross-chain promises.

### Proofs of Inference — provenance and verification

**Source:** [ETHGlobal Prague showcase](https://ethglobal.com/showcase/proofs-of-inference-6rug4). Awards: first place for Protocol Labs' Filecoin x Akave category and Hedera EVM category. Team documentation describes ezkl circuits, proof generation, storage of proofs/logs, escrow and local/on-chain verification, with request/history/verification UI.

**Our analysis:** Make verification a user action, not a trust badge. MirrorGap already hashes receipts; the missing step is independently recomputing their arithmetic. Proposed demo: modify a metric, recompute its hash, then show why arithmetic audit still fails. This demonstrates a narrower, testable property than zkML. MirrorGap does not claim zero-knowledge proof, oracle authenticity or on-chain settlement.

### QuickPay — payments and a complete user journey

**Source:** [Superhack 2024 showcase](https://ethglobal.com/showcase/quickpay-rxu7v). Superform's best ERC-7540 vault implementation, first place; also a Superhack finalist, not an asserted overall first place. The team describes Qpay QR parsing, Pyth conversion, USDC payment into a vault, notifications and a backend bank-transfer process. Base Sepolia and account abstraction support the flow.

**Our analysis:** Start with a recognizable job and finish it. The described coffee purchase supplies a clear before/after demonstration. MirrorGap's equivalent is an analyst handed a suspicious wrapper: compare, challenge the reference, export a review, audit the receipt. No wallet onboarding or paid API checkout is needed to complete that job; adding either would distract from RWA investigation.

### Silo Finance — DeFi and bounded risk

**Source:** [ETHOnline 2021 showcase](https://ethglobal.com/showcase/silo-finance-11v1e). Chainlink first place and ETHOnline finalist. The team describes isolated two-asset lending markets, modular oracle support (Chainlink and Uniswap), a subgraph-backed React interface and batched operations.

**Our analysis:** Keep risks and comparisons local to explicit boundaries. MirrorGap applies this to same-asset/same-currency comparisons and explicit per-token unit ratios. A useful demo is a comparison refused because the currency or ratio is incompatible. This prevents a plausible-looking but economically meaningless number. We do not imply that peer agreement proves backing, or copy a lending protocol.

### Chain Waves — provenance made inspectable

**Source:** [ETHGlobal San Francisco showcase](https://ethglobal.com/showcase/chain-waves-6yipt). Story's best overall use of Proof of Creativity Protocol, first place; San Francisco 2024 finalist. The team describes audio watermarking, on-chain ownership records and usage tracking, using signal processing to embed watermarks.

**Our analysis:** A claim should travel with the artifact a recipient inspects. MirrorGap's portable review contains the observations, comparison parameters, attribution and content hash, complementing the existing receipt. Proposed demo: hand the JSON to another reviewer and recompute its hash. That proves the artifact did not change, not legal ownership, original source truth or a real-world asset's backing.

### wagmi Ledger connect — developer tools

**Source:** [ETHGlobal Cannes showcase](https://ethglobal.com/showcase/wagmi-ledger-connect-tobn2). Ledger hardware integrations, first place. The team describes adding Device Management Kit/WebHID support to a TypeScript Wagmi connector, hardware testing, legacy/EIP-1559 transactions and error handling.

**Our analysis:** Meet developers in an existing interface and make failure states usable. MirrorGap therefore exposes the same workbench through HTTP, CLI and MCP, with Zod validation and explicit machine-readable refusals. The demonstrable moment is a user and an agent receiving the same evidence policy. We do not add hardware signing; the transferable strength is integration ergonomics rather than a new platform.

### Sentinel — market monitoring and agents

**Source:** [ETHGlobal Lisbon 2026 showcase](https://ethglobal.com/showcase/sentinel-yaqmj). Uniswap's best API integration, first place. Team documentation describes The Graph monitoring, policy thresholds in Redis, a scanner/worker, 0G risk scoring and Uniswap execution. Its public demo is described as dry-run incident triggers.

**Our analysis:** A demo can expose a meaningful response to an incident without pretending to move real money. MirrorGap keeps its deterministic fixture replay and adds an agent policy that never authorizes a trade or asserts underlying parity. Demonstrate stale evidence changing the review disposition and the exact refresh step. We adopt inspectable policy, not autonomous liquidation or an opaque AI risk score.

### BuckyFinance and The Future of France — Chainlink Block Magic

**Source:** [Chainlink's organizer results](https://chain.link/blog/block-magic-winners). BuckyFinance won Financial Services first place; it combined collateral prices, cross-chain movement and credit calculations using Data Feeds, CCIP and Functions. The Future of France won the Grand Prize; it teaches Web3 through seven progressively harder tasks and uses Automation, Functions, VRF and CCIP.

**Our analysis:** BuckyFinance reinforces that sponsor technology should supply a necessary input to the product. Remove CMC from MirrorGap and the RWA wrapper graph and observed comparisons disappear. The Future of France suggests a staged demo: one question, one action, one inspectable result at each step. Neither award establishes a causal recipe for winning. We adapt the workflow principles, not their credit scoring, game or token mechanics.

## Translation and priority matrix

| Reference                         | Strength                                     | MirrorGap adaptation                                                                  | Practical benefit                                                                                     | Difficulty / priority                                  |
| --------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| AssetSphere                       | External context for one identified RWA      | Attributed underlying quote with unit, currency, timestamp and mode checks            | Tests the actual underlying-price hypothesis without mislabelling CMC aggregate                       | Medium / P0 implemented                                |
| Proofs of Inference               | User-triggered verification                  | Offline receipt arithmetic and evidence-link audit                                    | Detects internally inconsistent receipts even after rehashing                                         | Medium / P0 implemented                                |
| QuickPay                          | Complete familiar workflow                   | Compare → challenge → export → audit                                                  | Analyst finishes a review, rather than browsing unrelated widgets                                     | Medium / P0 implemented                                |
| Silo Finance                      | Explicit isolation and modular references    | Per-asset comparison, same currency, explicit ratios, fail-closed incompatible quotes | Avoids invalid comparison and overconfident conclusions                                               | Medium / P0 implemented                                |
| Chain Waves                       | Evidence travels with artifact               | Self-contained review JSON plus existing receipt/capsule                              | Another reviewer can inspect and rehash the same inputs                                               | Low / P0 implemented                                   |
| wagmi Ledger connect              | Existing developer interfaces                | Shared deterministic workbench in REST, CLI, MCP                                      | Agent integration uses the same semantics as the UI                                                   | Low / P0 implemented                                   |
| Sentinel                          | Inspectable policies and safe incident demos | Freshness disposition, next checks, restrictive agent policy, fixture walkthrough     | Makes uncertainty and system response demonstrable                                                    | Medium / P0 implemented                                |
| BuckyFinance                      | Essential sponsor data                       | CMC quotes feed aggregate and leave-one-out peer analysis; IDs bind comparisons       | CMC provides the substance of the investigation                                                       | Medium / P0 implemented                                |
| The Future of France              | Progressive tasks                            | Three-stage workbench guidance and a scripted end-to-end demo                         | A judge can repeat each step and inspect its evidence                                                 | Low / P0 implemented                                   |
| AssetSphere / Silo                | Independent data providers                   | Automated, licensed underlying feed with corporate-action/unit mapping                | Removes manual quote input and strengthens underlying monitoring                                      | High / P1 deferred pending provider and data rights    |
| Proofs of Inference / Chain Waves | Stronger source provenance                   | Provider-authenticated source capture / attestation                                   | Distinguishes truthful source capture from self-issued hashes                                         | High / P1 deferred; ordinary hashing is not equivalent |
| Sentinel                          | Autonomous execution                         | No execution integration                                                              | Preserves integrity-observatory scope and avoids treating indicative gaps as executable opportunities | High / reject                                          |
| QuickPay                          | Payment rails                                | No x402/paywall added                                                                 | Keeps the review accessible and avoids an irrelevant checkout                                         | Medium / reject                                        |

## Unified product decision

**MirrorGap is an evidence-first RWA investigation workbench.** Its distinctive contribution is to make the boundary between wrapper disagreement, an indicative underlying comparison, and a verified fact visible and machine-readable. It is not an award-project collage.

Keep the existing observe/detect/investigate/prove loop. Add a focused review surface on asset detail, leave-one-out peer comparisons, an attributed underlying comparison, portable evidence and arithmetic audit. Retain deterministic logic; a conversational agent can call MCP without gaining permission to invent causes or trade. Do not add chains, tokens, payments, ZK, a new LLM dependency or a second database merely to resemble award winners.

See [workbench contract](workbench.md), [demo script](demo-script.md) and [validation report](upgrade-validation.md) for implemented behavior and verification. Award evidence informs design choices; it does not validate MirrorGap's implementation or predict contest results.
