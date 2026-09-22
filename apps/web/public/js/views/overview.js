import { $, api, ago, errorCard, esc, fmt, sevClass } from "../util.js";
import { mountInstrument } from "../instrument.js";
import { mountJourney } from "../journey.js";
const selection = {};

export async function mount(el, ctx) {
  try {
    const [ov, radar, events] = await Promise.all([
      api("/api/v1/overview"),
      api("/api/v1/radar"),
      api("/api/v1/events?limit=100"),
    ]);
    ctx.setMode(ov.dataMode);
    ctx.setCapability(radar.marketPairs);
    const ranked = [...radar.assets].sort((a, b) => (b.maxAbsGapPct ?? -1) - (a.maxAbsGapPct ?? -1));

    el.innerHTML = `
      <header class="page-intro">
        <div><p class="eyebrow"><span class="index-mark">01 /</span> MARKET INTEGRITY OBSERVATORY</p>
          <h2>One asset.<br>Several representations.<br><em>Inspect the difference.</em></h2></div>
        <div class="intro-aside"><span class="eyebrow">THE QUESTION BEHIND THE PRICE</span>
          <p>An optical observatory for tokenized markets. Align the observations. Inspect the offsets. Preserve the evidence.</p>
          <a class="text-action" href="#/radar">Explore the observation desk <span>↗</span></a>${events.events?.length ? `<br><a class="text-action" href="#/event/${encodeURIComponent((events.events.find((e) => e.rwaId === ranked[0]?.rwaId) ?? events.events[0]).eventId)}">Replay a retained incident →</a>` : ""}</div>
      </header>
      <div class="metrics-ribbon">
        ${metric("Assets observed", ov.assetsWatched, `${ov.assetsAnomalous} flagged by the engine`, "radar")}
        ${metric("Open incidents", ov.activeIncidents, `${ov.confirmedIncidents} confirmed`, "events")}
        ${metric("High / critical", ov.criticalOrHigh, "Requires closer review", "events")}
        ${metric("Evidence snapshots", fmt(ov.storage.snapshots, 0), ov.latestScan ? `Last scan ${ago(ov.latestScan.startedAt)}` : "Awaiting first scan", "diagnostics")}
      </div>
      <section class="instrument" id="observation-instrument" aria-label="Observation instrument"></section>
      <section class="evidence-journey" id="evidence-journey"></section>
      <section class="card incident-ledger">
        <div class="card-head"><div><p class="eyebrow">03 — TRACE</p><h2>Incident ledger</h2></div><a class="text-action" href="#/events">All incidents ↗</a></div>
        <div class="table-scroll"><table class="table"><thead><tr><th>Asset / incident</th><th>Classification</th><th>Severity</th><th>Status</th><th class="num">Peak deviation</th><th>First observed</th><th></th></tr></thead><tbody>
          ${
            (events.events ?? [])
              .slice(0, 5)
              .map(
                (e) =>
                  `<tr><td><a class="asset-link" href="#/event/${encodeURIComponent(e.eventId)}">${esc(e.assetSymbol)} <span class="record-id">${esc(e.eventId)}</span></a></td><td>${esc(e.kind.replaceAll("_", " "))}</td><td><span class="${sevClass(e.severity)}">${esc(e.severity)}</span></td><td><span class="state st-${esc(e.status)}">${esc(e.status)}</span></td><td class="num">${fmt(e.maxDeviationPct, 2)}%</td><td class="muted">${ago(e.firstSeenAt)}</td><td><a class="row-arrow" aria-label="Investigate ${esc(e.assetSymbol)}" href="#/event/${encodeURIComponent(e.eventId)}">↗</a></td></tr>`,
              )
              .join("") ||
            '<tr><td colspan="7" class="empty">No incident records yet. Explore assets to inspect their observations.</td></tr>'
          }
        </tbody></table></div>
      </section>
      <div class="evidence-note"><span class="evidence-mark">[ = ]</span><div><h3>Every conclusion needs a paper trail.</h3><p>Trace observations, challenge the reference, and export a self-verifying review for people and agents.</p></div><a class="text-action" href="#/about">How evidence works ↗</a></div>`;
    selection.onSelect = null;
    mountInstrument($("#observation-instrument", el), ranked, ov.dataMode, selection);
    let cleanup;
    $("#evidence-journey", el).innerHTML =
      '<p class="muted">Loading the retained evidence trail… The observation desk is ready.</p>';
    let version = 0;
    selection.onSelect = async () => {
      const id = ++version;
      const surface = document.createElement("div");
      const nextCleanup = await mountJourney(surface, events.events ?? [], { ...selection });
      if (id !== version || !el.isConnected) {
        nextCleanup?.();
        return;
      }
      cleanup?.();
      cleanup = nextCleanup;
      $("#evidence-journey", el).replaceChildren(surface);
    };
    el.__afterMount = () => selection.onSelect();
    el.__cleanup = () => {
      version++;
      cleanup?.();
    };
  } catch (e) {
    el.innerHTML = errorCard(e, true);
    $("[data-retry]", el)?.addEventListener("click", () => mount(el, ctx));
  }
}
function metric(label, value, sub, nav) {
  return `<a class="metric" href="#/${nav}"><span class="stat-label">${esc(label)}</span><strong>${esc(value)}</strong><span class="stat-sub">${esc(sub)}</span></a>`;
}
