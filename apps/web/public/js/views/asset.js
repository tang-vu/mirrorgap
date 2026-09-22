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
import { mountWorkbench } from "../workbench.js";

const WINDOWS = ["1h", "6h", "24h", "7d", "all"];

export async function mount(el, ctx, params) {
  await render(el, ctx, params[0], "24h");
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
    const thr = d.thresholds;

    el.innerHTML = `
      <button class="back" data-nav="radar">← observation desk</button>
      <div class="card asset-cover">
        <p class="eyebrow">INVESTIGATION FILE / ${esc(a.symbol)} / CMC RWA ${a.rwaId}</p>
        <div class="card-head">
          <h2>${esc(a.name)}</h2>
          <div>
            <span class="badge badge-mode ${d.dataMode}">${d.dataMode}</span>
            ${s ? `<span class="${sevClass(s.severity)}">${s.severity}</span>` : ""}
            <button class="btn-sm" id="watch-toggle">${d.watched ? "★ watching" : "☆ watch"}</button>
          </div>
        </div>
        <div class="asset-readings">
          <div><span class="stat-label">Maximum aggregate gap</span><strong>${s?.gaps.length ? fmt(Math.max(...s.gaps.map((g) => Math.abs(g.gapPct))), 2) + "<small>%</small>" : "—"}</strong></div>
          <div><span class="stat-label">Wrapper dispersion</span><strong>${s?.dispersion.dispersionPct != null ? fmt(s.dispersion.dispersionPct, 2) + "<small>%</small>" : "—"}</strong></div>
          <div><span class="stat-label">Reference freshness</span><strong class="reading-state">${esc(s?.reference.aggregateFreshness.state ?? "unavailable")}</strong><span class="muted">Underlying market: ${esc(s?.reference.underlyingMarket ?? "unknown")}</span></div>
          <button class="btn-sm btn-accent" id="jump-workbench">Review the evidence ↗</button>
        </div>
        <details class="asset-context"><summary>Reference context &amp; observation quality</summary>
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
        </details>
      </div>

      <div class="workspace-context"><span>Basis: wrapper / CMC tokenized aggregate</span><span>Source: CMC · ${esc(d.dataMode)}</span><span>Measured ${dateTime(s?.measuredAt)}</span><label>Selected wrapper <select id="asset-wrapper">${(s?.gaps ?? []).map((g) => `<option value="${esc(g.tokenSymbol)}">${esc(g.tokenSymbol)}</option>`).join("")}</select></label><span id="asset-wrapper-reading"></span></div>
      <nav class="workspace-nav" role="tablist" aria-label="Investigation sections"><span class="workspace-identity"><strong>${esc(a.symbol)}</strong><span id="workspace-wrapper"></span><small>CMC aggregate basis<br>${esc(d.dataMode)} / CMC</small></span><button role="tab" id="tab-history" data-section="history" aria-controls="section-history">01 History</button><button role="tab" id="tab-comparison" data-section="comparison" aria-controls="section-comparison">02 Comparisons</button><button role="tab" id="tab-representations" data-section="representations" aria-controls="section-representations">03 Representations</button><button role="tab" id="tab-incidents" data-section="incidents" aria-controls="section-incidents">04 Incidents</button></nav>
      <section id="section-history" class="workspace-section" role="tabpanel" aria-labelledby="tab-history">${historyPanel(h, thr, win)}
      </section><section id="section-representations" class="workspace-section" role="tabpanel" aria-labelledby="tab-representations"><div class="detail-grid">
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
      ${graphBlock(a, d.representations)}</section>
      <section id="section-comparison" class="workspace-section" role="tabpanel" aria-labelledby="tab-comparison"><section class="card" id="workbench" aria-label="Investigation Workbench"></section></section>
      <section id="section-incidents" class="workspace-section" role="tabpanel" aria-labelledby="tab-incidents">${eventsBlock(d.events) || '<div class="card empty">No retained incidents for this asset.</div>'}</section>
    `;

    await mountWorkbench($("#workbench", el), rwaId);
    function selectSection(name, focus = false) {
      $$("[data-section]", el).forEach((b) => {
        b.setAttribute("aria-selected", String(b.dataset.section === name));
        b.tabIndex = b.dataset.section === name ? 0 : -1;
      });
      $$(".workspace-section", el).forEach((s) => (s.hidden = s.id !== `section-${name}`));
      if (focus) $(`[data-section="${name}"]`, el).focus();
    }
    $$("[data-section]", el).forEach((b, i, buttons) => {
      b.addEventListener("click", () => selectSection(b.dataset.section));
      b.addEventListener("keydown", (e) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
        e.preventDefault();
        const n =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? buttons.length - 1
              : (i + (e.key === "ArrowLeft" ? -1 : 1) + buttons.length) % buttons.length;
        selectSection(buttons[n].dataset.section, true);
      });
    });
    selectSection("history");
    const inspectWrapper = () => {
      const g = s?.gaps.find((g) => g.tokenSymbol === $("#asset-wrapper", el).value);
      $("#workspace-wrapper", el).textContent = g?.tokenSymbol ?? "No measurement";
      $("#asset-wrapper-reading", el).textContent = g
        ? `${g.tokenPrice} ${g.currency} · ${fmtPct(g.gapPct)} vs ${g.referencePrice} aggregate`
        : "No comparable measurement";
    };
    $("#asset-wrapper", el).addEventListener("change", inspectWrapper);
    inspectWrapper();
    $("#jump-workbench", el).addEventListener("click", () => {
      selectSection("comparison");
      const target = $("#workbench", el);
      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
      target.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
        block: "start",
      });
    });
    $("[data-nav]", el)?.addEventListener("click", (e) => ctx.navigate(e.target.dataset.nav));
    let historyRequest = 0;
    $("#section-history", el).addEventListener("click", async (ev) => {
      const button = ev.target.closest("[data-win]");
      if (!button) return;
      const request = ++historyRequest;
      try {
        const history = await api(`/api/v1/assets/${rwaId}/history?window=${button.dataset.win}`);
        if (request !== historyRequest || !el.isConnected) return;
        $$("[data-win]", el).forEach((b) => b.classList.toggle("active", b === button));
        $("#section-history", el).innerHTML = historyPanel(history, thr, button.dataset.win);
      } catch (err) {
        let notice = $("#history-error", el);
        if (!notice) {
          notice = document.createElement("p");
          notice.id = "history-error";
          notice.setAttribute("role", "alert");
          $("#section-history", el).prepend(notice);
        }
        notice.textContent = `History unavailable: ${err.message}. Previous window retained.`;
      }
    });
    api("/api/v1/watchlist")
      .then((wl) => {
        const b = $("#watch-toggle", el);
        b.disabled = wl.canMutate !== true;
        if (b.disabled) {
          b.textContent = d.watched ? "★ Watching · read only" : "Watchlist · read only";
          b.title = "Shared watchlist changes require server-authorized access.";
        }
      })
      .catch(() => {
        const b = $("#watch-toggle", el);
        b.disabled = true;
        b.textContent = "Watchlist access unavailable";
      });
    $("#watch-toggle", el).disabled = true;
    $("#watch-toggle", el)?.addEventListener("click", async () => {
      const button = $("#watch-toggle", el);
      button.disabled = true;
      button.textContent = "Saving…";
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
        d.watched = !d.watched;
        button.textContent = d.watched ? "★ Watching · saved" : "☆ Watch · removed";
      } catch (err) {
        button.textContent = "Watchlist save failed";
        button.title = err.message;
      } finally {
        button.disabled = false;
      }
    });
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
  let nodes = `<g><circle cx="${cx}" cy="${yA}" r="22" fill="#c54b2b"/><text class="node-label" x="${cx}" y="${yA - 30}" text-anchor="middle">${esc(asset.symbol)}</text></g>`;
  const issuers = new Map();
  reps.forEach((r, i) => {
    const x = cx + (i - (n - 1) / 2) * 170;
    nodes += `<line class="edge" x1="${cx}" y1="${yA + 22}" x2="${x}" y2="${yW - 18}"/>`;
    nodes += `<g><rect x="${x - 46}" y="${yW - 18}" width="92" height="36" rx="8" fill="#f0f1e9" stroke="#deded5"/>
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
    nodes += `<text class="node-label" x="${x}" y="${yI}" text-anchor="middle" fill="#697166">${esc(name)}</text>`;
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
          `<tr><td class="mono"><a href="#/event/${encodeURIComponent(e.eventId)}">${esc(e.eventId)}</a></td><td>${esc(e.kind)}</td><td><span class="${sevClass(e.severity)}">${e.severity}</span></td><td><span class="state">${e.status}</span></td><td class="num">${e.maxDeviationPct.toFixed(2)}%</td><td class="num">${e.confirmations}</td><td class="muted">${ago(e.lastSeenAt)}</td></tr>`,
      )
      .join("")}
  </tbody></table></div>`;
}

function historyPanel(h, thr, win) {
  const gapPts = h.points.map((p) => ({ t: p.measuredAt, y: p.maxSignedGapPct, sev: p.severity }));
  const dispPts = h.points.map((p) => ({ t: p.measuredAt, y: p.dispersionPct, sev: p.severity }));
  return `<div class="card" id="history-panel" style="margin-top:16px">
        <div class="card-head">
          <h2>Divergence history <span class="muted">· signed max-wrapper gap</span></h2>
          <div class="win-tabs">${WINDOWS.map((w) => `<button class="win ${w === win ? "active" : ""}" data-win="${w}">${w}</button>`).join("")}</div>
        </div>
        ${lineChart(gapPts, {
          thresholds: thr
            ? [
                { y: thr.info, label: "info", color: "#366ba4" },
                { y: thr.watch, label: "watch", color: "#997215" },
                { y: thr.high, label: "high", color: "#b94a25" },
                { y: -thr.info, label: "", color: "#366ba4" },
                { y: -thr.watch, label: "", color: "#997215" },
                { y: -thr.high, label: "", color: "#b94a25" },
              ]
            : [],
          yLabel: "gap %",
        })}
        <div class="card-head" style="margin-top:18px"><h2>Cross-wrapper dispersion</h2></div>
        ${lineChart(dispPts, { color: "#997215", area: true, yLabel: "dispersion %" })}
        <p class="muted" style="margin-top:8px">
          ${h.stats.points} observations · peak |gap| ${h.stats.peakAbsGapPct?.toFixed(2) ?? "—"}%
          ${h.stats.peakAt ? `at ${dateTime(h.stats.peakAt)}` : ""} ·
          anomalous ${(h.stats.anomalousShare * 100).toFixed(0)}% of window ·
          stale ${(h.stats.staleShare * 100).toFixed(0)}% · market-closed ${(h.stats.marketClosedShare * 100).toFixed(0)}%
        </p>
      </div><details><summary>Exact history ledger · UTC / percent</summary><div class="table-scroll"><table class="table"><thead><tr><th>Time UTC</th><th>Signed gap %</th><th>Dispersion %</th><th>Freshness</th><th>Market</th></tr></thead><tbody>${h.points.map((p) => `<tr><td>${esc(p.measuredAt)}</td><td>${p.maxSignedGapPct ?? "absent"}</td><td>${p.dispersionPct ?? "absent"}</td><td>${esc(p.aggregateFreshness ?? "unknown")}</td><td>${esc(p.underlyingMarket ?? "unknown")}</td></tr>`).join("")}</tbody></table></div></details>`;
}
