/* Asset detail — wrappers, reference context, history charts, incidents. */
import {
  $,
  $$,
  api,
  ago,
  dateTime,
  empty,
  errorCard,
  esc,
  fmt,
  fmtPct,
  sevClass,
  stateClass,
  SEV_COLOR,
} from "../util.js";
import { lineChart } from "../charts.js";

const WINDOWS = ["1h", "6h", "24h", "7d", "all"];

export async function mount(el, ctx, params) {
  const rwaId = params[0];
  let win = "24h";
  const redraw = () => render(el, ctx, rwaId, win);
  await render(el, ctx, rwaId, win);
  function setWindow(w) {
    win = w;
    redraw();
  }
  el.__setWindow = setWindow;
}

async function render(el, ctx, rwaId, win) {
  try {
    const [d, h] = await Promise.all([
      api(`/api/v1/assets/${rwaId}`),
      api(`/api/v1/assets/${rwaId}/history?window=${win}`),
    ]);
    ctx.setMode(d.dataMode);
    const a = d.asset;
    const s = d.snapshot;
    const gapPts = h.points.map((p) => ({ t: p.measuredAt, y: p.maxSignedGapPct, sev: p.severity }));
    const dispPts = h.points.map((p) => ({ t: p.measuredAt, y: p.dispersionPct, sev: p.severity }));
    const thr = d.thresholds;

    el.innerHTML = `
      <button class="back" data-nav="radar">← radar</button>
      <div class="card">
        <div class="card-head">
          <h2>${esc(a.name)} <span class="muted">${esc(a.symbol)} · rwa_id ${a.rwaId}</span></h2>
          <div>
            <span class="badge badge-mode ${d.dataMode}">${d.dataMode}</span>
            ${s ? `<span class="${sevClass(s.severity)}">${s.severity}</span>` : ""}
            <button class="btn-sm" id="watch-toggle">${d.watched ? "★ watching" : "☆ watch"}</button>
          </div>
        </div>
        <dl class="kv">
          <dt>Asset type</dt><dd>${esc(a.assetType)}</dd>
          <dt>Primary exchange</dt><dd>${esc(a.primaryExchange ?? "unknown")}</dd>
          <dt>Reference state</dt><dd>${s ? `<span class="${stateClass(s.reference.state)}">${s.reference.state}</span>` : "—"}</dd>
          <dt>Underlying market</dt><dd>${s ? `<span class="${stateClass(s.reference.underlyingMarket)}">${s.reference.underlyingMarket}</span> <span class="muted">${esc(s.reference.underlyingDetail ?? "")}</span>` : "—"}</dd>
          <dt>Aggregate freshness</dt><dd>${s ? `<span class="${stateClass(s.reference.aggregateFreshness.state)}">${s.reference.aggregateFreshness.state}</span>` : "—"}</dd>
          <dt>Measured</dt><dd>${s ? `${ago(s.measuredAt)} (${dateTime(s.measuredAt)})` : "—"}</dd>
          <dt>Data quality</dt><dd>${s ? fmt(s.dataQuality.score * 100, 0) + "%" : "—"}</dd>
          <dt>Classification</dt><dd>${s?.classification ? esc(s.classification) : "—"}</dd>
        </dl>
        ${s ? `<p class="muted" style="margin-top:10px">${s.reference.explanations.map(esc).join(" ")}</p>` : ""}
      </div>

      <div class="card" style="margin-top:16px">
        <div class="card-head">
          <h2>Divergence history <span class="muted">· signed max-wrapper gap</span></h2>
          <div class="win-tabs">${WINDOWS.map((w) => `<button class="win ${w === win ? "active" : ""}" data-win="${w}">${w}</button>`).join("")}</div>
        </div>
        ${lineChart(gapPts, {
          thresholds: thr
            ? [
                { y: thr.info, label: "info", color: "#5b9dff" },
                { y: thr.watch, label: "watch", color: "#f5c453" },
                { y: thr.high, label: "high", color: "#f5853f" },
                { y: -thr.info, label: "", color: "#5b9dff" },
                { y: -thr.watch, label: "", color: "#f5c453" },
                { y: -thr.high, label: "", color: "#f5853f" },
              ]
            : [],
          yLabel: "gap %",
        })}
        <div class="card-head" style="margin-top:18px"><h2>Cross-wrapper dispersion</h2></div>
        ${lineChart(dispPts, { color: "#f5c453", area: true, yLabel: "dispersion %" })}
        <p class="muted" style="margin-top:8px">
          ${h.stats.points} observations · peak |gap| ${h.stats.peakAbsGapPct?.toFixed(2) ?? "—"}%
          ${h.stats.peakAt ? `at ${dateTime(h.stats.peakAt)}` : ""} ·
          anomalous ${(h.stats.anomalousShare * 100).toFixed(0)}% of window ·
          stale ${(h.stats.staleShare * 100).toFixed(0)}% · market-closed ${(h.stats.marketClosedShare * 100).toFixed(0)}%
        </p>
      </div>

      <div class="detail-grid">
        <div class="card">
          <div class="card-head"><h2>Parity gaps vs tokenized aggregate</h2></div>
          ${gapsTable(s)}
        </div>
        <div class="card">
          <div class="card-head"><h2>Cross-wrapper dispersion</h2></div>
          ${dispersionBlock(s)}
          <div class="card-head" style="margin-top:16px"><h2>Wrappers</h2></div>
          ${repsBlock(d.representations)}
        </div>
      </div>
      ${graphBlock(a, d.representations)}
      ${eventsBlock(d.events)}
    `;

    $("[data-nav]", el)?.addEventListener("click", (e) => ctx.navigate(e.target.dataset.nav));
    $$("[data-win]", el).forEach((b) =>
      b.addEventListener("click", () => {
        el.__setWindow?.(b.dataset.win);
      }),
    );
    $$("[data-event]", el).forEach((tr) =>
      tr.addEventListener("click", () => ctx.navigate(`event/${tr.dataset.event}`)),
    );
    $("#watch-toggle", el)?.addEventListener("click", async () => {
      try {
        if (d.watched) {
          await api(`/api/v1/watchlist/${a.rwaId}`, { method: "DELETE" });
        } else {
          await api(`/api/v1/watchlist`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ rwaId: a.rwaId }),
          });
        }
        redraw();
      } catch (err) {
        alert(`watchlist: ${err.message}`);
      }
    });
    function redraw() {
      render(el, ctx, rwaId, win);
    }
  } catch (e) {
    el.innerHTML = errorCard(e, true);
    $("[data-retry]", el)?.addEventListener("click", () => render(el, ctx, rwaId, win));
  }
}

function gapsTable(s) {
  const rows = (s?.gaps ?? [])
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
  return `<table class="table"><thead><tr><th>Wrapper</th><th>Token</th><th>Reference</th><th>Gap</th><th></th></tr></thead>
  <tbody>${rows || `<tr><td colspan="5" class="muted">no comparable wrappers</td></tr>`}</tbody></table>`;
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
  return `<table class="table"><thead><tr><th>Symbol</th><th>Name</th><th>Issuer</th><th>CMC id</th></tr></thead><tbody>
    ${(reps ?? []).map((r) => `<tr><td class="mono">${esc(r.symbol)}</td><td>${esc(r.name ?? "—")}</td><td>${esc(r.issuerName ?? r.issuerId ?? "—")}</td><td class="num muted">${r.cryptoId}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">—</td></tr>`}
  </tbody></table>`;
}

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
    nodes += `<g><rect x="${x - 46}" y="${yW - 18}" width="92" height="36" rx="8" fill="#1a2030" stroke="#232b3d"/>
      <text class="node-label" x="${x}" y="${yW + 4}" text-anchor="middle">${esc(r.symbol)}</text></g>`;
    if (r.issuerName) {
      if (!issuers.has(r.issuerName)) issuers.set(r.issuerName, []);
      issuers.get(r.issuerName).push(x);
    }
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

function eventsBlock(events) {
  if (!events?.length) return "";
  return `<div class="card" style="margin-top:16px"><div class="card-head"><h2>Incidents for this asset</h2></div>
  <table class="table"><thead><tr><th>Incident</th><th>Kind</th><th>Severity</th><th>Status</th><th>Peak</th><th>Conf</th><th>Last seen</th></tr></thead><tbody>
    ${events
      .map(
        (e) =>
          `<tr data-event="${esc(e.eventId)}"><td class="mono">${esc(e.eventId)}</td><td>${esc(e.kind)}</td><td><span class="${sevClass(e.severity)}">${e.severity}</span></td><td><span class="state">${e.status}</span></td><td class="num">${e.maxDeviationPct.toFixed(2)}%</td><td class="num">${e.confirmations}</td><td class="muted">${ago(e.lastSeenAt)}</td></tr>`,
      )
      .join("")}
  </tbody></table></div>`;
}
