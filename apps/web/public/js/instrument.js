import { $, $$, esc, fmt, fmtPct, dateTime } from "./util.js";
import { openingMotion, moveCarriage } from "./motion.js";

// The scale is shared by every displayed measurement; missing values never become zero.
export function mountInstrument(el, assets, mode, state = {}) {
  state.disposeInstrument?.();
  const extent = Math.max(
    1,
    Math.ceil(
      Math.max(
        0,
        ...assets
          .flatMap((a) => a.gaps ?? [])
          .map((g) => Math.abs(g.gapPct))
          .filter(Number.isFinite),
      ) * 2,
    ) / 2,
  );
  const selected = assets.find((a) => String(a.rwaId) === String(state.asset)) ?? assets[0];
  if (!selected) {
    el.innerHTML =
      '<div class="empty"><h3>The bench is awaiting observations.</h3><p>No comparable measurements are retained.</p><a href="#/diagnostics">Inspect the source →</a></div>';
    return;
  }
  state.asset = selected.rwaId;
  const gaps = (selected.gaps ?? []).filter((g) => Number.isFinite(g.gapPct));
  if (!gaps.some((g) => g.tokenSymbol === state.wrapper)) state.wrapper = gaps[0]?.tokenSymbol;
  el.innerHTML = `<div class="instrument-head"><div><p class="eyebrow">REGISTRATION BENCH / 01</p><h2>Several views. One comparison plane.</h2></div><label>Observed asset<select id="instrument-asset">${assets.map((a) => `<option value="${a.rwaId}" ${a.rwaId === selected.rwaId ? "selected" : ""}>${esc(a.symbol)} · ${esc(a.name)}</option>`).join("")}</select></label></div>
    <div class="instrument-context"><span>${esc(mode)} / CMC</span><span>Measured ${dateTime(selected.measuredAt)}</span><span>Freshness at scan: ${esc(selected.referenceFreshness)}</span><span>Market: ${esc(selected.underlyingMarket)}</span></div>
    <div class="bench-layout"><div class="bench-plane divergence-map" role="group" aria-label="Signed wrapper deviation in percent">
      <div class="apparatus" aria-hidden="true"><div class="apparatus-housing"><span class="apparatus-screw one"></span><span class="apparatus-screw two"></span><div class="apparatus-plane"></div><div class="apparatus-plate rear"></div><div class="apparatus-plate front"></div><div class="apparatus-aperture"></div><div class="apparatus-beam"></div><div class="apparatus-rail"></div>${gaps.map((g) => `<i class="apparatus-mark ${g.gapPct < 0 ? "below" : "above"}" style="left:${50 + (g.gapPct / extent) * 43}%"></i>`).join("")}<div class="apparatus-carriage" style="left:50%"><span></span></div></div><div class="apparatus-caption"><span>OPTICAL REGISTRATION / ${esc(selected.symbol)}</span><span>CMC AGGREGATE / ZERO PLANE</span></div></div>
      <div class="bench-axis"><span>−${fmt(extent, 1)}%</span><span>${gaps.length ? "CMC AGGREGATE / 0" : "REFERENCE UNAVAILABLE"}</span><span>+${fmt(extent, 1)}%</span></div>
      ${gaps.length ? gaps.map((g, i) => `<div class="bench-row"><span class="bench-name">${String(i + 1).padStart(2, "0")} / ${esc(g.tokenSymbol)}</span><div class="bench-track"><span class="zero-line"></span><span class="registration-arm" style="left:${Math.min(50, 50 + (g.gapPct / extent) * 43)}%;width:${Math.abs((g.gapPct / extent) * 43)}%"></span><button class="registration ${g.gapPct < 0 ? "below" : "above"}" style="left:${50 + (g.gapPct / extent) * 43}%" data-wrapper="${esc(g.tokenSymbol)}" aria-label="Inspect ${esc(g.tokenSymbol)}, ${fmtPct(g.gapPct)}" aria-pressed="${state.wrapper === g.tokenSymbol}"><span></span></button></div><span class="bench-value">${fmtPct(g.gapPct)}</span></div>`).join("") : '<div class="empty"><h3>Comparison plane unavailable</h3><p>No comparable reference measurements. Nothing is plotted.</p></div>'}
      <div class="bench-axis"><span>BELOW AGGREGATE</span><span>Signed difference · %</span><span>ABOVE AGGREGATE</span></div>
      <p class="bench-boundary">This plane is a tokenized aggregate, not an independent underlying quote. Direction does not indicate severity.</p>
    </div><aside class="bench-inspector" aria-live="polite"></aside></div>
    <details class="exact-ledger"><summary>Exact measurement ledger · ${gaps.length} wrappers</summary><div class="table-scroll"><table class="table"><thead><tr><th>Inspect wrapper</th><th>Token price</th><th>Aggregate price</th><th>Signed gap %</th></tr></thead><tbody>${gaps.map((g) => `<tr data-ledger="${esc(g.tokenSymbol)}"><td><button class="btn-sm" data-wrapper="${esc(g.tokenSymbol)}">${esc(g.tokenSymbol)}</button></td><td class="num">${esc(g.tokenPrice)} ${esc(g.currency ?? "")}</td><td class="num">${esc(g.referencePrice)} ${esc(g.currency ?? "")}</td><td class="num">${esc(g.gapPct)}</td></tr>`).join("")}</tbody></table></div></details>`;
  function inspect(symbol) {
    state.wrapper = symbol;
    state.onSelect?.(selected, symbol);
    const g = gaps.find((g) => g.tokenSymbol === symbol);
    if (g) moveCarriage(el, 50 + (g.gapPct / extent) * 43);
    $$(".apparatus-mark", el).forEach((mark, index) =>
      mark.classList.toggle("focal", gaps[index]?.tokenSymbol === symbol),
    );
    $$(".registration", el).forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.wrapper === symbol)),
    );
    $$("[data-ledger]", el).forEach((r) => r.classList.toggle("selected", r.dataset.ledger === symbol));
    $(".bench-inspector", el).innerHTML = g
      ? `<p class="eyebrow">SELECTED REGISTRATION</p><h3>${esc(g.tokenSymbol)}</h3><strong class="instrument-reading">${fmtPct(g.gapPct)}</strong><p>${g.gapPct < 0 ? "Below" : g.gapPct > 0 ? "Above" : "Aligned with"} the tokenized aggregate</p><dl class="kv"><dt>Token price</dt><dd>${esc(g.tokenPrice)} ${esc(g.currency ?? "")}</dd><dt>Aggregate</dt><dd>${esc(g.referencePrice)} ${esc(g.currency ?? "")}</dd><dt>Reference</dt><dd>${esc(selected.referenceState)}</dd></dl><a class="primary-action" href="#/asset/${selected.rwaId}">Investigate ${esc(selected.symbol)} <span>↗</span></a>`
      : `<h3>Evidence is incomplete.</h3><p>Missing measurements remain absent. Inspect source availability before drawing a conclusion.</p><a href="#/asset/${selected.rwaId}">Open asset context →</a>`;
  }
  $$("[data-wrapper]", el).forEach((b) => b.addEventListener("click", () => inspect(b.dataset.wrapper)));
  $("#instrument-asset", el).addEventListener("change", (e) => {
    state.asset = Number(e.target.value);
    mountInstrument(el, assets, mode, state);
  });
  inspect(state.wrapper);
  state.disposeInstrument = openingMotion(el);
}
