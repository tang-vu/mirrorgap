/* Overview — the first screen: what is watched and where something is wrong. */
import {
  $,
  $$,
  api,
  ago,
  clock,
  dateTime,
  empty,
  errorCard,
  esc,
  fmt,
  sevClass,
  stateClass,
  SEV_COLOR,
} from "../util.js";

export async function mount(el, ctx) {
  try {
    const [ov, events] = await Promise.all([api("/api/v1/overview"), api("/api/v1/events?limit=8")]);
    ctx.setMode(ov.dataMode);
    const active = (events.events ?? []).filter((e) => e.status === "candidate" || e.status === "confirmed");
    const latestScan = ov.latestScan;
    el.innerHTML = `
      <div class="stat-grid">
        ${stat("Assets monitored", ov.assetsWatched, `${ov.assetsAnomalous} anomalous`, "radar")}
        ${stat("Active incidents", ov.activeIncidents, `${ov.confirmedIncidents} confirmed`, "events", ov.activeIncidents > 0)}
        ${stat("Critical / High", ov.criticalOrHigh, "severity ≥ high", "events", ov.criticalOrHigh > 0, "high")}
        ${stat(
          "Last scan",
          latestScan ? ago(latestScan.startedAt) : "never",
          latestScan
            ? `${latestScan.assetsScanned} assets · ${latestScan.anomaliesFound} anomalies`
            : "run a scan",
          null,
        )}
        ${stat("Evidence", ov.storage.transitions + " transitions", `${ov.storage.snapshots} snapshots`, null)}
      </div>

      <div class="detail-grid">
        <div class="card">
          <div class="card-head">
            <h2>Where something is wrong</h2>
            <a class="link" href="#/radar">open radar →</a>
          </div>
          ${activeIncidentsTable(active)}
        </div>
        <div class="card">
          <div class="card-head"><h2>Observatory status</h2></div>
          <dl class="kv">
            <dt>Data mode</dt><dd><span class="badge badge-mode ${ov.dataMode}">${ov.dataMode}</span></dd>
            <dt>Watchlist</dt><dd>${ov.watchlistSize} enabled ${ov.watchlistSize === 0 ? "(ranked fallback)" : ""}</dd>
            <dt>CMC capability</dt><dd>market-pairs: ${esc(ov.capabilities?.marketPairs ?? "?")}</dd>
            <dt>Signing</dt><dd>${ov.signingConfigured ? "ed25519 enabled" : "unsigned (hash-verified only)"}</dd>
            <dt>Alerts</dt><dd>${ov.alertsConfigured ? "configured" : "no destinations"}</dd>
            <dt>Event counts</dt><dd>${
              Object.entries(ov.eventCounts)
                .map(([k, n]) => `${n} ${k}`)
                .join(" · ") || "—"
            }</dd>
            <dt>DB size</dt><dd>${ov.storage.dbBytes !== null ? `${(ov.storage.dbBytes / 1024 / 1024).toFixed(2)} MiB` : "—"}</dd>
          </dl>
          ${ov.dataMode === "fixture" ? `<p class="muted" style="margin-top:12px">Fixture mode replays a scripted incident cycle — real engine code paths, synthetic prices.</p>` : ""}
        </div>
      </div>
    `;
    $$("[data-nav]", el).forEach((n) => n.addEventListener("click", () => ctx.navigate(n.dataset.nav)));
    $$("[data-event]", el).forEach((tr) =>
      tr.addEventListener("click", () => ctx.navigate(`event/${tr.dataset.event}`)),
    );
  } catch (e) {
    el.innerHTML = errorCard(e, true);
    $("[data-retry]", el)?.addEventListener("click", () => mount(el, ctx));
  }
}

function stat(label, value, sub, nav, hot = false, color = null) {
  return `<div class="stat ${hot ? "stat-hot" : ""}" ${nav ? `data-nav="${nav}" role="button" tabindex="0"` : ""}>
    <div class="stat-label">${esc(label)}</div>
    <div class="stat-value" ${color ? `style="color:var(--${color})"` : ""}>${esc(String(value))}</div>
    <div class="stat-sub">${esc(sub ?? "")}</div>
  </div>`;
}

function activeIncidentsTable(active) {
  if (!active.length) {
    return `<p class="muted" style="padding:8px 0">No open incidents — all watched assets are inside configured thresholds.</p>`;
  }
  return `<table class="table"><thead><tr>
    <th>Incident</th><th>Asset</th><th>Kind</th><th>Severity</th><th>Status</th><th>Deviation</th><th>Peak</th><th>Since</th>
  </tr></thead><tbody>
    ${active
      .map(
        (e) => `<tr data-event="${esc(e.eventId)}">
      <td class="mono">${esc(e.eventId)}</td>
      <td><strong>${esc(e.assetSymbol)}</strong></td>
      <td>${esc(e.kind)}</td>
      <td><span class="${sevClass(e.severity)}">${e.severity}</span></td>
      <td><span class="state">${e.status}</span></td>
      <td class="num">${e.latestDeviationPct.toFixed(2)}%</td>
      <td class="num">${e.maxDeviationPct.toFixed(2)}%</td>
      <td class="muted">${ago(e.firstSeenAt)}</td>
    </tr>`,
      )
      .join("")}
  </tbody></table>`;
}
