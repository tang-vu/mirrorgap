import { $, $$, api, ago, errorCard, esc, fmt, sevClass, stateClass } from "../util.js";
import { divergenceMap } from "../divergence.js";

const retained = { filter: "", sort: "gap", asset: null, wrapper: null };

export async function mount(el, ctx) {
  try {
    const d = await api("/api/v1/radar");
    ctx.setMode(d.dataMode);
    ctx.setCapability(d.marketPairs);
    el.innerHTML = `
      <header class="desk-intro"><div><p class="eyebrow">02 / OBSERVATION DESK</p><h2>Find the disconnect.</h2><p class="muted">Compare token wrappers against their CMC aggregate. Investigate before drawing a conclusion.</p></div><span class="desk-label">Updated ${ago(d.generatedAt)}</span></header>
      <section class="card"><div class="card-head"><h2>Parity Radar <span class="muted">/ divergence field</span></h2>
        <label class="filter-label">Order by <select id="radar-sort"><option value="gap">Largest gap</option><option value="symbol">Asset name</option></select></label></div>
        <div class="radar-controls"><label class="filter-search">Find an asset<input id="radar-filter" type="search" placeholder="Symbol or asset name" autocomplete="off"></label><span id="radar-count" class="muted"></span></div>
        <div id="radar-chart"></div><section id="wrapper-inspector" class="wrapper-inspector" aria-live="polite"><p>Select a registration mark to inspect its exact measurement.</p></section>
        <p class="chart-foot">Each dot is one wrapper. Shared scale across all displayed assets. CMC aggregate ≠ independent underlying price.</p>
      </section>
      <section class="card incident-ledger"><div class="card-head"><h2>Observation register</h2><span class="eyebrow">REFERENCE CONTEXT MATTERS</span></div>
        <div class="table-scroll"><table class="table" id="asset-table"><thead><tr>
          <th>Asset</th><th>Reference</th><th>Market</th><th>Freshness</th><th class="num">Max |gap|</th><th class="num">Dispersion</th><th class="num">Wrappers</th><th>Severity</th>
        </tr></thead><tbody></tbody></table></div>
      </section>`;
    $("#radar-filter", el).value = retained.filter;
    $("#radar-sort", el).value = retained.sort;
    function inspect(asset, symbol) {
      retained.asset = asset.rwaId;
      retained.wrapper = symbol;
      const gap = asset.gaps.find((g) => g.tokenSymbol === symbol);
      if (!gap) return;
      $$(".field-dot", el).forEach((b) =>
        b.setAttribute(
          "aria-pressed",
          String(Number(b.dataset.asset) === asset.rwaId && b.dataset.wrapper === symbol),
        ),
      );
      $("#wrapper-inspector", el).innerHTML =
        `<h3>${esc(asset.symbol)} / ${esc(symbol)}</h3><p>Token ${esc(gap.tokenPrice)} · CMC aggregate ${esc(gap.referencePrice)} · signed gap ${esc(gap.gapPct)}%</p><p>Measured ${esc(asset.measuredAt)} · ${esc(asset.referenceFreshness)} · market ${esc(asset.underlyingMarket)} · ${esc(d.dataMode)}</p><a href="#/asset/${asset.rwaId}">Investigate ${esc(asset.symbol)} →</a>`;
    }
    function renderRows() {
      retained.filter = $("#radar-filter", el).value;
      retained.sort = $("#radar-sort", el).value;
      const q = $("#radar-filter", el).value.trim().toLowerCase();
      const assets = d.assets.filter((a) => `${a.symbol} ${a.name}`.toLowerCase().includes(q));
      assets.sort(
        $("#radar-sort", el).value === "symbol"
          ? (a, b) => a.symbol.localeCompare(b.symbol)
          : (a, b) => (b.maxAbsGapPct ?? -1) - (a.maxAbsGapPct ?? -1),
      );
      $("#radar-count", el).textContent = `${assets.length} of ${d.assets.length} assets`;
      $("#radar-chart", el).innerHTML = divergenceMap(assets);
      $$(".field-dot", el).forEach((b) =>
        b.addEventListener("click", () =>
          inspect(
            d.assets.find((a) => a.rwaId === Number(b.dataset.asset)),
            b.dataset.wrapper,
          ),
        ),
      );
      const selected = assets.find((a) => a.rwaId === retained.asset);
      if (selected) inspect(selected, retained.wrapper);
      else
        $("#wrapper-inspector", el).innerHTML =
          "<p>Select a registration mark to inspect its exact measurement.</p>";
      $("#asset-table tbody", el).innerHTML =
        assets
          .map(
            (a) => `<tr data-rwa="${a.rwaId}">
        <td><a class="asset-link" href="#/asset/${a.rwaId}">${esc(a.symbol)}<span class="record-id">${esc(a.name)}</span></a></td>
        <td><span class="${stateClass(a.referenceState)}">${esc(a.referenceState)}</span></td>
        <td><span class="${stateClass(a.underlyingMarket)}">${esc(a.underlyingMarket)}</span></td>
        <td><span class="${stateClass(a.referenceFreshness)}">${esc(a.referenceFreshness)}</span></td>
        <td class="num">${a.maxAbsGapPct !== null ? fmt(a.maxAbsGapPct, 2) + "%" : "—"}</td>
        <td class="num">${a.dispersionPct !== null ? fmt(a.dispersionPct, 2) + "%" : "—"}</td>
        <td class="num">${a.wrapperCount}</td><td><span class="${sevClass(a.severity)}">${esc(a.severity)}</span></td>
      </tr>`,
          )
          .join("") ||
        '<tr><td colspan="8" class="empty">No matching assets. Try another symbol or clear the filter.</td></tr>';
    }
    $("#radar-filter", el).addEventListener("input", renderRows);
    $("#radar-sort", el).addEventListener("change", renderRows);
    renderRows();
  } catch (e) {
    el.innerHTML = errorCard(e, true);
    $("[data-retry]", el)?.addEventListener("click", () => mount(el, ctx));
  }
}
