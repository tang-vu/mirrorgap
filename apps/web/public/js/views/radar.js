/* Integrity Radar — parity blips + asset table. */
import { $, $$, api, ago, errorCard, esc, fmt, sevClass, stateClass, SEV_COLOR } from "../util.js";

export async function mount(el, ctx) {
  try {
    const d = await api("/api/v1/radar");
    ctx.setMode(d.dataMode);
    ctx.setCapability(d.marketPairs);
    el.innerHTML = `
      <div class="radar-layout">
        <div class="card radar-panel">
          <div class="card-head"><h2>Parity Radar</h2><span class="muted">updated ${ago(d.generatedAt)}</span></div>
          <div id="radar-chart" class="radar-chart"></div>
          <div class="legend">
            <span><i class="dot dot-none"></i> aligned</span>
            <span><i class="dot dot-info"></i> info</span>
            <span><i class="dot dot-watch"></i> watch</span>
            <span><i class="dot dot-high"></i> high</span>
            <span><i class="dot dot-critical"></i> critical</span>
          </div>
          <p class="muted legend-note">radius = max |gap| vs tokenized aggregate (clamped 4%) · dashed ring = stale reference</p>
        </div>
        <div class="card radar-panel">
          <div class="card-head"><h2>Assets under observation</h2><span class="muted">${d.assets.length}</span></div>
          <table class="table" id="asset-table">
            <thead><tr>
              <th>Asset</th><th>Ref state</th><th>Market</th><th>Fresh</th><th>Max gap</th><th>Dispersion</th><th>Wrappers</th><th>Severity</th>
            </tr></thead>
            <tbody>
              ${d.assets
                .map(
                  (a) => `<tr data-rwa="${a.rwaId}" tabindex="0">
                <td><strong>${esc(a.symbol)}</strong> <span class="muted">${esc(a.name)}</span></td>
                <td><span class="${stateClass(a.referenceState)}">${a.referenceState}</span></td>
                <td><span class="${stateClass(a.underlyingMarket)}">${a.underlyingMarket}</span></td>
                <td><span class="${stateClass(a.referenceFreshness)}">${a.referenceFreshness}</span></td>
                <td class="num">${a.maxAbsGapPct !== null ? fmt(a.maxAbsGapPct, 2) + "%" : "—"}</td>
                <td class="num">${a.dispersionPct !== null ? fmt(a.dispersionPct, 2) + "%" : "—"}</td>
                <td class="num">${a.wrapperCount}</td>
                <td><span class="${sevClass(a.severity)}">${a.severity}</span></td>
              </tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>`;
    drawRadar($("#radar-chart", el), d.assets, ctx);
    $$("#asset-table tbody tr", el).forEach((tr) => {
      const go = () => ctx.navigate(`asset/${tr.dataset.rwa}`);
      tr.addEventListener("click", go);
      tr.addEventListener("keydown", (e) => e.key === "Enter" && go());
    });
  } catch (e) {
    el.innerHTML = errorCard(e, true);
    $("[data-retry]", el)?.addEventListener("click", () => mount(el, ctx));
  }
}

function drawRadar(el, assets, ctx) {
  const W = 460,
    H = 460,
    cx = W / 2,
    cy = H / 2,
    R = 200;
  const rings = [1, 2, 3, 4];
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="parity radar">`;
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
    const x = cx + Math.cos(angle) * rr;
    const y = cy + Math.sin(angle) * rr;
    const color = SEV_COLOR[a.severity] ?? SEV_COLOR.none;
    const stale = a.referenceFreshness === "stale" || a.referenceState === "unavailable";
    svg += `<g class="radar-blip" data-rwa="${a.rwaId}" tabindex="0" role="button" aria-label="${esc(a.symbol)} severity ${a.severity}">
      <circle cx="${x}" cy="${y}" r="${stale ? 8 : 6}" fill="${color}" opacity="0.9"${stale ? ' stroke="#8b95ab" stroke-width="1" stroke-dasharray="2 2"' : ""}>
        <animate attributeName="opacity" values="0.9;0.5;0.9" dur="2.4s" repeatCount="indefinite"/>
      </circle>
      <text class="blip-label" x="${x + 10}" y="${y + 3}">${esc(a.symbol)}</text>
    </g>`;
  });
  svg += "</svg>";
  el.innerHTML = svg;
  $$(".radar-blip", el).forEach((b) => {
    const go = () => ctx.navigate(`asset/${b.dataset.rwa}`);
    b.addEventListener("click", go);
    b.addEventListener("keydown", (e) => e.key === "Enter" && go());
  });
}
