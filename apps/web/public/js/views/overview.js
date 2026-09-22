import { $, api, ago, errorCard, esc, fmt, sevClass } from "../util.js";
import { divergenceMap } from "../divergence.js";

export async function mount(el, ctx) {
  try {
    const [ov, radar, events] = await Promise.all([
      api("/api/v1/overview"),
      api("/api/v1/radar"),
      api("/api/v1/events?limit=5"),
    ]);
    ctx.setMode(ov.dataMode);
    ctx.setCapability(radar.marketPairs);
    const ranked = [...radar.assets].sort((a, b) => (b.maxAbsGapPct ?? -1) - (a.maxAbsGapPct ?? -1));
    const lead = ranked.find((a) => a.maxAbsGapPct !== null);
    el.innerHTML = `
      <header class="page-intro">
        <div><p class="eyebrow"><span class="index-mark">01 /</span> MARKET INTEGRITY OBSERVATORY</p>
          <h2>Same asset.<br><em>Different reality.</em></h2></div>
        <div class="intro-aside"><span class="eyebrow">THE QUESTION BEHIND THE PRICE</span>
          <p>When tokenized markets disagree,<br> follow the gap. Then check the evidence.</p>
          <a class="text-action" href="#/radar">Explore the observation desk <span>↗</span></a></div>
      </header>
      <div class="metrics-ribbon">
        ${metric("Assets observed", ov.assetsWatched, `${ov.assetsAnomalous} flagged by the engine`, "radar")}
        ${metric("Open incidents", ov.activeIncidents, `${ov.confirmedIncidents} confirmed`, "events")}
        ${metric("High / critical", ov.criticalOrHigh, "Requires closer review", "events")}
        ${metric("Evidence snapshots", fmt(ov.storage.snapshots, 0), ov.latestScan ? `Last scan ${ago(ov.latestScan.startedAt)}` : "Awaiting first scan", "diagnostics")}
      </div>
      <div class="observation-grid">
        <section class="card divergence-panel">
          <div class="card-head"><div><p class="eyebrow">01 — OBSERVE</p><h2>The divergence field</h2></div><span class="desk-label">${esc(ov.dataMode)} / CMC</span></div>
          <p class="chart-description">Each dot is a wrapper. The center is its CMC tokenized aggregate.</p>
          ${divergenceMap(ranked.slice(0, 6))}
          <div class="chart-foot"><span><i class="plot-key"></i> Token wrapper</span><span>Position = signed gap, not underlying premium</span></div>
          <a class="text-action" href="#/radar">View all ${radar.assets.length} assets <span>→</span></a>
        </section>
        <aside class="focus-note">
          <div class="focus-top"><p class="eyebrow">02 — INVESTIGATE</p><span class="focus-cross">↗</span></div>
          <p class="focus-label">${lead ? "Largest observed aggregate gap" : "Waiting for comparable observations"}</p>
          ${
            lead
              ? `<div class="focus-asset">${esc(lead.symbol)} <span class="${sevClass(lead.severity)}">${esc(lead.severity)}</span></div>
            <div class="focus-number">${fmt(lead.maxAbsGapPct, 2)}<span>%</span></div>
            <p class="focus-caption">Maximum absolute wrapper gap</p>
            <div class="focus-facts"><div><span>Reference</span><strong>${esc(lead.referenceState)}</strong></div><div><span>Underlying market</span><strong>${esc(lead.underlyingMarket)}</strong></div><div><span>Wrappers observed</span><strong>${lead.wrapperCount}</strong></div></div>
            <p class="focus-disclaimer">A discrepancy is a question, not a trade signal. Check freshness, issuer terms and an independent underlying quote.</p>
            <a class="primary-action" href="#/asset/${lead.rwaId}">Open investigation <span>↗</span></a>`
              : `<p class="focus-disclaimer">Once a scan produces comparable wrappers, the largest observed gap will appear here.</p><a class="primary-action" href="#/diagnostics">Check data source →</a>`
          }
        </aside>
      </div>
      <section class="card incident-ledger">
        <div class="card-head"><div><p class="eyebrow">03 — TRACE</p><h2>Incident ledger</h2></div><a class="text-action" href="#/events">All incidents ↗</a></div>
        <div class="table-scroll"><table class="table"><thead><tr><th>Asset / incident</th><th>Classification</th><th>Severity</th><th>Status</th><th class="num">Peak deviation</th><th>First observed</th><th></th></tr></thead><tbody>
          ${(events.events ?? []).map((e) => `<tr><td><a class="asset-link" href="#/event/${encodeURIComponent(e.eventId)}">${esc(e.assetSymbol)} <span class="record-id">${esc(e.eventId)}</span></a></td><td>${esc(e.kind.replaceAll("_", " "))}</td><td><span class="${sevClass(e.severity)}">${esc(e.severity)}</span></td><td><span class="state st-${esc(e.status)}">${esc(e.status)}</span></td><td class="num">${fmt(e.maxDeviationPct, 2)}%</td><td class="muted">${ago(e.firstSeenAt)}</td><td><a class="row-arrow" aria-label="Investigate ${esc(e.assetSymbol)}" href="#/event/${encodeURIComponent(e.eventId)}">↗</a></td></tr>`).join("") || '<tr><td colspan="7" class="empty">No incident records yet. Explore assets to inspect their observations.</td></tr>'}
        </tbody></table></div>
      </section>
      <div class="evidence-note"><span class="evidence-mark">[ = ]</span><div><h3>Every conclusion needs a paper trail.</h3><p>Trace observations, challenge the reference, and export a self-verifying review for people and agents.</p></div><a class="text-action" href="#/about">How evidence works ↗</a></div>`;
  } catch (e) {
    el.innerHTML = errorCard(e, true);
    $("[data-retry]", el)?.addEventListener("click", () => mount(el, ctx));
  }
}
function metric(label, value, sub, nav) {
  return `<a class="metric" href="#/${nav}"><span class="stat-label">${esc(label)}</span><strong>${esc(value)}</strong><span class="stat-sub">${esc(sub)}</span></a>`;
}
