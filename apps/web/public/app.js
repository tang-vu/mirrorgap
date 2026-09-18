/* MirrorGap observatory UI — vanilla ES modules, no build step. */

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const fmt = (n, d = 4) =>
  n === null || n === undefined ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: d });
const fmtPct = (n) => (n === null || n === undefined ? "—" : `${n > 0 ? "+" : ""}${fmt(n, 2)}%`);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const sevClass = (s) => `sev sev-${s ?? "none"}`;
const stateClass = (s) => `state ${s ?? ""}`;
const ago = (iso) => {
  if (!iso) return "—";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${(s / 3600).toFixed(1)}h ago`;
};

async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

/* ---------------- router ---------------- */
const views = ["radar", "events", "about", "asset", "event"];
let currentView = "radar";
function show(view, id) {
  currentView = view;
  for (const v of views) $(`#view-${v}`)?.classList.toggle("hidden", v !== view);
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === view));
  if (view === "asset" && id) loadAsset(id);
  if (view === "event" && id) loadEvent(id);
  if (view === "events") loadEvents();
  location.hash = `${view}${id ? `/${id}` : ""}`;
}
$$(".tab").forEach((t) => t.addEventListener("click", () => show(t.dataset.view)));
window.addEventListener("hashchange", () => {
  const [v, id] = location.hash.slice(1).split("/");
  if (v && views.includes(v) && (v !== currentView || id)) show(v, id);
});

/* ---------------- radar ---------------- */
const SEV_ORDER = { critical: 4, high: 3, watch: 2, info: 1, none: 0 };
const SEV_COLOR = {
  none: "#3ddc97",
  info: "#5b9dff",
  watch: "#f5c453",
  high: "#f5853f",
  critical: "#f5564e",
};

function drawRadar(assets) {
  const el = $("#radar-chart");
  const W = 460,
    H = 460,
    cx = W / 2,
    cy = H / 2,
    R = 200;
  // angle = index around circle; radius = maxAbsGapPct clamped to [0, 4%]
  const rings = [1, 2, 3, 4];
  let svg = `<svg viewBox="0 0 ${W} ${H}">`;
  for (const r of rings) {
    svg += `<circle cx="${cx}" cy="${cy}" r="${(r / 4) * R}" fill="none" stroke="#232b3d" stroke-width="1"/>`;
    svg += `<text x="${cx + 4}" y="${cy - (r / 4) * R + 12}" fill="#8b95ab" font-size="9" font-family="monospace">${r}%</text>`;
  }
  svg += `<line x1="${cx}" y1="${cy - R}" x2="${cx}" y2="${cy + R}" stroke="#232b3d"/>`;
  svg += `<line x1="${cx - R}" y1="${cy}" x2="${cx + R}" y2="${cy}" stroke="#232b3d"/>`;
  svg += `<circle cx="${cx}" cy="${cy}" r="4" fill="#44d7b6"/>`;
  const n = assets.length || 1;
  assets.forEach((a, i) => {
    const gap = Math.min(4, Math.abs(a.maxAbsGapPct ?? a.dispersionPct ?? 0));
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    const rr = Math.max(0.12, gap / 4) * R;
    const x = cx + Math.cos(angle) * rr,
      y = cy + Math.sin(angle) * rr;
    const color = SEV_COLOR[a.severity] ?? SEV_COLOR.none;
    svg += `<g class="radar-blip" data-rwa="${a.rwaId}">
      <circle cx="${x}" cy="${y}" r="6" fill="${color}" opacity="0.9"><animate attributeName="opacity" values="0.9;0.5;0.9" dur="2.4s" repeatCount="indefinite"/></circle>
      <text class="blip-label" x="${x + 9}" y="${y + 3}">${esc(a.symbol)}</text>
    </g>`;
  });
  svg += "</svg>";
  el.innerHTML = svg;
  $$(".radar-blip", el).forEach((b) => b.addEventListener("click", () => show("asset", b.dataset.rwa)));
}

async function loadRadar() {
  try {
    const d = await api("/api/v1/radar");
    $("#mode-badge").textContent = d.dataMode;
    $("#mode-badge").className = `badge badge-mode ${d.dataMode}`;
    const mp = d.marketPairs?.marketPairs;
    $("#cap-badge").textContent =
      mp === "yes" ? "market-pairs ✓" : mp === "no" ? "market-pairs: plan-gated" : "market-pairs: ?";
    $("#cap-badge").className = `badge badge-cap ${mp === "yes" ? "ok" : mp === "no" ? "no" : ""}`;
    $("#radar-ts").textContent = `updated ${ago(d.generatedAt)}`;
    drawRadar(d.assets);
    const tbody = $("#asset-table tbody");
    tbody.innerHTML = d.assets
      .map(
        (a) => `
      <tr data-rwa="${a.rwaId}">
        <td><strong>${esc(a.symbol)}</strong> <span class="muted">${esc(a.name)}</span></td>
        <td><span class="${stateClass(a.referenceState)}">${a.referenceState}</span> <span class="${stateClass(a.underlyingMarket)}">${a.underlyingMarket}</span></td>
        <td class="num">${fmtPct(a.maxAbsGapPct)}</td>
        <td class="num">${fmt(a.dispersionPct, 2)}%</td>
        <td class="num">${a.wrapperCount}</td>
        <td><span class="${sevClass(a.severity)}">${a.severity}</span></td>
      </tr>`,
      )
      .join("");
    $$("#asset-table tbody tr").forEach((tr) =>
      tr.addEventListener("click", () => show("asset", tr.dataset.rwa)),
    );
  } catch (e) {
    console.error("radar:", e);
  }
}

/* ---------------- events ---------------- */
async function loadEvents() {
  const status = $("#event-filter").value;
  const d = await api(`/api/v1/events${status ? `?status=${status}` : ""}`);
  const tbody = $("#event-table tbody");
  tbody.innerHTML = (d.events ?? [])
    .map(
      (e) => `
    <tr data-event="${esc(e.eventId)}">
      <td class="mono">${esc(e.eventId)}</td>
      <td><strong>${esc(e.assetSymbol)}</strong></td>
      <td>${esc(e.kind)}</td>
      <td><span class="${sevClass(e.severity)}">${e.severity}</span></td>
      <td><span class="state">${e.status}</span></td>
      <td class="num">${fmtPct(e.latestDeviationPct)}</td>
      <td class="num">${e.confirmations}</td>
      <td class="muted">${ago(e.lastSeenAt)}</td>
    </tr>`,
    )
    .join("");
  $$("#event-table tbody tr").forEach((tr) =>
    tr.addEventListener("click", () => show("event", tr.dataset.event)),
  );
}
$("#event-filter").addEventListener("change", loadEvents);

/* ---------------- asset detail ---------------- */
async function loadAsset(rwaId) {
  const d = await api(`/api/v1/assets/${rwaId}`);
  const a = d.asset,
    s = d.snapshot;
  const el = $("#asset-detail");
  const gapRows = (s?.gaps ?? [])
    .map((g) => {
      const w = Math.min(100, (Math.abs(g.gapPct) / 4) * 100);
      return `<tr>
      <td class="mono">${esc(g.tokenSymbol)}</td>
      <td class="num">${fmt(g.tokenPrice)} ${esc(g.currency)}</td>
      <td class="num">${fmt(g.referencePrice)}</td>
      <td class="num" style="color:${g.gapPct >= 0 ? "var(--high)" : "var(--accent2)"}">${fmtPct(g.gapPct)}</td>
      <td><div class="gapbar"><div class="gapbar-fill" style="width:${w}%;background:${SEV_COLOR[s.severity]}"></div></div></td>
    </tr>`;
    })
    .join("");
  el.innerHTML = `
    <button class="back" onclick="location.hash='radar'">← radar</button>
    <div class="card">
      <div class="card-head">
        <h2>${esc(a.name)} <span class="muted">${esc(a.symbol)}</span></h2>
        <div>
          <span class="badge badge-mode ${d.dataMode}">${d.dataMode}</span>
          ${s ? `<span class="${sevClass(s.severity)}">${s.severity}</span>` : ""}
        </div>
      </div>
      <dl class="kv">
        <dt>RWA ID</dt><dd>${a.rwaId}</dd>
        <dt>Asset type</dt><dd>${esc(a.assetType)}</dd>
        <dt>Primary exchange</dt><dd>${esc(a.primaryExchange ?? "unknown")}</dd>
        <dt>Reference state</dt><dd>${s ? `<span class="${stateClass(s.reference.state)}">${s.reference.state}</span>` : "—"}</dd>
        <dt>Underlying market</dt><dd>${s ? `<span class="${stateClass(s.reference.underlyingMarket)}">${s.reference.underlyingMarket}</span>` : "—"}</dd>
        <dt>Aggregate freshness</dt><dd>${s ? `<span class="${stateClass(s.reference.aggregateFreshness.state)}">${s.reference.aggregateFreshness.state}</span>` : "—"}</dd>
        <dt>Measured</dt><dd>${s ? ago(s.measuredAt) : "—"}</dd>
        <dt>Data quality</dt><dd>${s ? fmt(s.dataQuality.score * 100, 0) + "%" : "—"}</dd>
      </dl>
      ${s ? `<p class="muted" style="margin-top:10px">${s.reference.explanations.map(esc).join(" ")}</p>` : ""}
    </div>
    <div class="detail-grid">
      <div class="card">
        <div class="card-head"><h2>Parity gaps vs tokenized aggregate</h2></div>
        <table class="table"><thead><tr><th>Wrapper</th><th>Token</th><th>Reference</th><th>Gap</th><th></th></tr></thead>
        <tbody>${gapRows || `<tr><td colspan="5" class="muted">no comparable wrappers</td></tr>`}</tbody></table>
      </div>
      <div class="card">
        <div class="card-head"><h2>Cross-wrapper dispersion</h2></div>
        ${dispersionBlock(s)}
        <div class="card-head" style="margin-top:16px"><h2>Wrappers</h2></div>
        ${repsBlock(d.representations)}
      </div>
    </div>
    ${graphBlock(a, d.representations)}
    ${
      (d.events ?? []).length
        ? `<div class="card" style="margin-top:16px"><div class="card-head"><h2>Events for this asset</h2></div>
      <table class="table"><tbody>${d.events.map((e) => `<tr data-event="${e.eventId}" onclick="location.hash='event/${e.eventId}'"><td class="mono">${e.eventId}</td><td>${e.kind}</td><td><span class="${sevClass(e.severity)}">${e.severity}</span></td><td>${e.status}</td><td class="muted">${ago(e.lastSeenAt)}</td></tr>`).join("")}</tbody></table></div>`
        : ""
    }
  `;
}

function dispersionBlock(s) {
  if (!s || s.dispersion.wrapperCount < 2)
    return `<p class="muted">Cross-wrapper analysis needs ≥2 token representations.</p>`;
  const d = s.dispersion;
  return `<dl class="kv">
    <dt>Spread</dt><dd>${fmt(d.dispersionPct, 3)}%</dd>
    <dt>Min</dt><dd>${esc(d.minTokenSymbol ?? "?")} @ ${fmt(d.minPrice)}</dd>
    <dt>Max</dt><dd>${esc(d.maxTokenSymbol ?? "?")} @ ${fmt(d.maxPrice)}</dd>
    <dt>Median</dt><dd>${fmt(d.medianPrice)}</dd>
  </dl>`;
}
function repsBlock(reps) {
  return `<table class="table"><thead><tr><th>Symbol</th><th>Issuer</th><th>Chain</th></tr></thead><tbody>
    ${(reps ?? []).map((r) => `<tr><td class="mono">${esc(r.symbol)}</td><td>${esc(r.issuerName ?? r.issuerId ?? "—")}</td><td class="muted">${esc(r.platform ?? "—")}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">—</td></tr>`}
  </tbody></table>`;
}

/* relationship graph: asset → wrappers → issuers, plus reference context */
function graphBlock(asset, reps) {
  if (!reps?.length) return "";
  const W = 760,
    H = 260,
    cx = W / 2;
  const yA = 40,
    yW = 140,
    yI = 230;
  const n = reps.length;
  let nodes = `<g><circle cx="${cx}" cy="${yA}" r="22" fill="#44d7b6"/><text class="node-label" x="${cx}" y="${yA - 30}" text-anchor="middle">${esc(asset.symbol)}</text></g>`;
  const issuers = new Map();
  reps.forEach((r, i) => {
    const x = cx + (i - (n - 1) / 2) * 170;
    nodes += `<line class="edge" x1="${cx}" y1="${yA + 22}" x2="${x}" y2="${yW - 18}"/>`;
    nodes += `<g><rect x="${x - 42}" y="${yW - 18}" width="84" height="36" rx="8" fill="#1a2030" stroke="#232b3d"/>
      <text class="node-label" x="${x}" y="${yW + 4}" text-anchor="middle">${esc(r.symbol)}</text></g>`;
    if (r.issuerName && !issuers.has(r.issuerName)) issuers.set(r.issuerName, []);
    if (r.issuerName) issuers.get(r.issuerName).push(x);
  });
  let ix = 0;
  for (const [name, xs] of issuers) {
    const x = xs.reduce((a, b) => a + b, 0) / xs.length + (ix++ - (issuers.size - 1) / 2) * 10;
    for (const wx of xs) nodes += `<line class="edge" x1="${wx}" y1="${yW + 18}" x2="${x}" y2="${yI - 16}"/>`;
    nodes += `<text class="node-label" x="${x}" y="${yI}" text-anchor="middle" fill="#8b95ab">${esc(name)}</text>`;
  }
  return `<div class="card" style="margin-top:16px"><div class="card-head"><h2>Representation graph</h2></div>
    <svg class="graph-svg" viewBox="0 0 ${W} ${H}">${nodes}</svg></div>`;
}

/* ---------------- event detail ---------------- */
async function loadEvent(eventId) {
  const d = await api(`/api/v1/events/${eventId}`);
  const e = d.event,
    el = $("#event-detail");
  const claims = (d.investigation?.claims ?? [])
    .map(
      (c) => `
    <div class="claim ${c.kind}"><div class="claim-kind">${c.kind}</div>
      <p>${esc(c.statement)}</p>
      <div class="hash">evidence: ${(c.evidenceIds ?? []).map(esc).join(", ") || "—"}</div></div>`,
    )
    .join("");
  const limitations = (d.investigation?.limitations ?? []).map((l) => `<li>${esc(l)}</li>`).join("");
  const receipt = d.receipt;
  el.innerHTML = `
    <button class="back" onclick="location.hash='events'">← events</button>
    <div class="card">
      <div class="card-head"><h2>${esc(e.eventId)} — ${esc(e.assetSymbol)} ${esc(e.kind)}</h2>
        <span class="${sevClass(e.severity)}">${e.severity}</span></div>
      ${d.explanation ? `<div class="claim derived" style="margin-bottom:14px"><div class="claim-kind">${d.explanation.mode === "llm_assisted" ? "narrative (llm-assisted)" : "narrative"}</div><p><strong>${esc(d.explanation.headline)}</strong></p><p class="muted">${esc(d.explanation.narrative)}</p></div>` : ""}
      <dl class="kv">
        <dt>Status</dt><dd>${e.status}</dd>
        <dt>Classification</dt><dd>${esc(e.classification)}</dd>
        <dt>First seen</dt><dd>${esc(e.firstSeenAt)}</dd>
        <dt>Last seen</dt><dd>${esc(e.lastSeenAt)}</dd>
        <dt>Confirmations</dt><dd>${e.confirmations}</dd>
        <dt>Max deviation</dt><dd>${fmtPct(e.maxDeviationPct)}</dd>
        <dt>Data mode</dt><dd><span class="badge badge-mode ${e.dataMode}">${e.dataMode}</span></dd>
      </dl>
    </div>
    <div class="detail-grid">
      <div class="card"><div class="card-head"><h2>Claim ledger</h2></div>${claims || '<p class="muted">Investigation pending — event not yet confirmed.</p>'}${limitations ? `<h3 style="margin-top:14px">Limitations</h3><ul>${limitations}</ul>` : ""}</div>
      <div class="card"><div class="card-head"><h2>Evidence receipt</h2></div>${receiptBlock(d)}</div>
    </div>`;
}

function receiptBlock(d) {
  const r = d.receipt;
  if (!r) return `<p class="muted">A receipt is issued when the event is confirmed.</p>`;
  const v = d.verification;
  return `
    <dl class="kv">
      <dt>Receipt</dt><dd>${esc(r.receiptId)}</dd>
      <dt>Schema</dt><dd>${esc(r.schema)}</dd>
      <dt>Generated</dt><dd>${esc(r.generatedAt)}</dd>
      <dt>Hash</dt><dd class="hash">${esc(r.receiptHash)}</dd>
      <dt>Signature</dt><dd>${r.signature ? `${esc(r.signature.algorithm)} · ${esc(r.signature.publicKey.slice(0, 20))}…` : "unsigned"}</dd>
      <dt>Verification</dt><dd>${v ? (v.ok ? `<span class="verify-ok">✓ verified</span>` : `<span class="verify-bad">✗ ${esc(v.errors.join("; "))}</span>`) : "—"}</dd>
    </dl>
    <p class="muted" style="margin-top:10px">Verify independently: <code>mirrorgap receipt ${esc(d.event.eventId)} --verify</code> re-hashes the canonical payload.</p>`;
}

/* ---------------- search ---------------- */
let searchTimer;
$("#search").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (q.length < 1) return $("#search-results").classList.add("hidden");
  searchTimer = setTimeout(async () => {
    const d = await api(`/api/v1/assets?q=${encodeURIComponent(q)}`);
    const box = $("#search-results");
    box.innerHTML =
      (d.assets ?? [])
        .map(
          (a) =>
            `<div class="sr-item" data-rwa="${a.rwaId}"><span class="sr-sym">${esc(a.symbol)}</span><span class="sr-name">${esc(a.name)}</span></div>`,
        )
        .join("") || `<div class="sr-item"><span class="sr-name">no matches</span></div>`;
    box.classList.remove("hidden");
    $$(".sr-item[data-rwa]", box).forEach((it) =>
      it.addEventListener("click", () => {
        box.classList.add("hidden");
        show("asset", it.dataset.rwa);
      }),
    );
  }, 200);
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-box")) $("#search-results").classList.add("hidden");
});

/* ---------------- live stream ---------------- */
function connectStream() {
  const es = new EventSource("/api/v1/stream");
  es.onopen = () => $("#live-dot").classList.add("on");
  es.onerror = () => $("#live-dot").classList.remove("on");
  es.addEventListener("snapshot", () => {
    if (currentView === "radar") loadRadar();
  });
  es.addEventListener("event", () => {
    if (currentView === "events") loadEvents();
  });
  es.addEventListener("scan_finished", () => {
    if (currentView === "radar") loadRadar();
  });
}

/* ---------------- boot ---------------- */
const [hv, hid] = location.hash.slice(1).split("/");
show(hv && views.includes(hv) ? hv : "radar", hid);
loadRadar();
connectStream();
setInterval(loadRadar, 30_000);
