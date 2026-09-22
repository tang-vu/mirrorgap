/* About — how MirrorGap works. */
export async function mount(el) {
  el.innerHTML = `
    <div class="card prose">
      <h2>The system that watches whether tokenized reality still agrees with reality</h2>
      <p>
        MirrorGap is an autonomous observatory for tokenized real-world assets. It continuously
        compares tokenized RWA representations against the best available reference observations,
        detects meaningful parity gaps and cross-wrapper disagreement, investigates them
        deterministically, and issues <strong>cryptographically verifiable evidence</strong>.
      </p>
      <div class="pipeline">
        <div class="pipe-step">Observe<br /><small>CMC RWA API</small></div>
        <div class="pipe-arrow">→</div>
        <div class="pipe-step">Detect<br /><small>parity · dispersion · freshness</small></div>
        <div class="pipe-arrow">→</div>
        <div class="pipe-step">Investigate<br /><small>claim ledger · lifecycle</small></div>
        <div class="pipe-arrow">→</div>
        <div class="pipe-step">Prove<br /><small>Evidence Capsule · SHA-256 · Ed25519</small></div>
      </div>

      <img src="/optical-bench.svg" width="880" height="240" style="width:100%;height:auto" alt="Three observation paths align to a labeled comparison plane; a signed offset is retained as evidence. Concept diagram, not market measurements.">
      <h3>Three comparison planes</h3><ol><li><strong>CMC tokenized aggregate:</strong> wrapper versus the provider’s tokenized-market average. This is not an independent underlying quote.</li><li><strong>Leave-one-out peers:</strong> wrapper versus the median of other same-currency wrappers. Same-provider agreement is not independent corroboration; disagreement does not identify the correct wrapper.</li><li><strong>Analyst underlying quote:</strong> price multiplied by explicit units per token. Accepted inputs remain indicative and unauthenticated. No automatic feed, FX conversion or corporate-action adjustment.</li></ol>
      <h3>What counts as an anomaly</h3>
      <ul>
        <li><strong>parity_gap</strong> — a wrapper's price diverges from the tokenized-asset aggregate reference.</li>
        <li><strong>cross_wrapper_dispersion</strong> — wrappers disagree with each other beyond thresholds.</li>
      </ul>
      <p>
        Every classification is honest about context: a difference measured while the reference is
        stale or the underlying market is closed is a <em>price difference</em>, not a verified parity
        failure. Unverifiable states are labelled, never silently promoted to incidents.
      </p>

      <h3>Honest by construction</h3>
      <ul>
        <li><code>market_closed</code> and <code>stale</code> reference states prevent after-hours differences from being reported as verified parity failures.</li>
        <li>Every claim is classified <em>observed / derived / supported_hypothesis / unknown</em> — the engine never invents causes.</li>
        <li>Receipts are canonical JSON + SHA-256; anyone can re-hash and verify. Optional Ed25519 signatures bind the issuer key.</li>
        <li>Fixture vs live mode is always visible in the badge and inside every provenance record.</li>
      </ul>

      <h3>Historical integrity</h3>
      <p>
        Every scan persists observations, snapshots and lifecycle transitions. Assets expose
        divergence/dispersion/staleness time series (1h → all); incidents expose replayable timelines
        with per-transition market frames; capsules wrap the exact hashed receipt with human context.
      </p>

      <h3>Surfaces</h3>
      <ul>
        <li><strong>Web observatory</strong> — this UI + SSE live updates.</li>
        <li><strong>REST API</strong> — <code>/api/v1/*</code> (radar, history, timeline, capsules, watchlist, alerts, diagnostics).</li>
        <li><strong>CLI</strong> — <code>mirrorgap scan|radar|history|timeline|capsule|watchlist|doctor</code>.</li>
        <li><strong>MCP</strong> — agent-native tools; the deterministic engine decides, agents consume evidence.</li>
      </ul>

      <h3>CoinMarketCap endpoints used</h3>
      <p>
        <code>/v5/real-world-assets/map</code> · <code>/info</code> · <code>/quotes/latest</code> ·
        <code>/assets/list</code> · <code>/issuers/list</code> · <code>/issuers</code> ·
        <code>/market-pairs/list</code> (Growth+ feature-detected) · <code>/v1/key/info</code>
      </p>
      <p class="muted">
        MirrorGap is a monitoring and evidence system. It is not a trading bot, not an arbitrage bot,
        not a price predictor.
      </p>
    </div>`;
}
