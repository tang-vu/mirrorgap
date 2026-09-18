# X/Twitter launch post — MirrorGap

## Primary post

Is tokenized reality still matching reality?

Tokenized stocks trade 24/7. Their references don't. When a wrapper drifts — who checks whether that's a real divergence or just a closed market?

I built MirrorGap for the #CoinMarketCap API Hackathon: an autonomous observatory that continuously verifies tokenized RWAs against their references and issues cryptographically verifiable evidence receipts.

🔍 Parity gaps + cross-wrapper dispersion, detected deterministically
🕐 Honest semantics — market_closed/stale references can't produce false alarms
📜 Every anomaly ships a SHA-256 receipt anyone can re-hash and verify
🤖 MCP-native — agents get real integrity tools, not just get_price

Real World Assets track. Open source.

DoraHacks: <dorahacks-url>
Demo: <demo-video-url>
Repo: <repo-url>

#BuildwithCMC

## Thread (optional, for reach)

1/
A tokenized NVIDIA share can trade on Saturday. NVDA can't.

So when the token moves and the stock didn't — is that price discovery or a broken peg? Today, nobody systematically answers that. That's the gap MirrorGap watches.

2/
The @CoinMarketCap RWA API is what made this possible — it's the only crypto API that returns BOTH sides in one call: the tokenized aggregate AND each individual wrapper (NVDAX, NVDAon) with issuer identity.

3/
The part I'm proudest of: honesty by construction. A stale or market-closed reference produces a "price difference," never a fake "verified parity failure." Every investigation claim is labeled observed/derived/hypothesis/unknown. The engine never invents causes.

4/
Every confirmed anomaly issues an evidence receipt: canonical JSON → SHA-256 → optional Ed25519 signature. Re-hash it yourself. Tamper with one digit — verification fails. Receipts, not vibes.

5/
Open source: <repo-url>
DoraHacks submission: <dorahacks-url>
Demo video: <demo-video-url>

Built for the @CoinMarketCap API Hackathon — Real World Assets track. #BuildwithCMC
