import { esc, fmt, fmtPct } from "./util.js";

// One common, symmetric scale. Never impute missing observations as zero.
export function divergenceMap(assets) {
  const values = assets
    .flatMap((a) => a.gaps ?? [])
    .map((g) => g.gapPct)
    .filter(Number.isFinite);
  const extent = Math.max(1, Math.ceil(Math.max(0, ...values.map(Math.abs)) * 2) / 2);
  return `<div class="divergence-map" role="group" aria-label="Wrapper deviations from the CMC tokenized aggregate">
    <div class="field-axis"><span>ASSET</span><div><span>−${fmt(extent, 1)}%</span><span>AGGREGATE / 0</span><span>+${fmt(extent, 1)}%</span></div><span>MAX |GAP|</span></div>
    ${
      assets
        .map(
          (a) => `<div class="field-row">
      <div class="field-name"><a class="asset-link" href="#/asset/${a.rwaId}">${esc(a.symbol)}</a><span>${esc(a.assetType ?? "RWA")}</span></div>
      <div class="field-track" style="height:${Math.max(72, (a.gaps ?? []).length * 48)}px">${(a.gaps ?? []).some((g) => Number.isFinite(g.gapPct)) ? '<span class="zero-line"></span>' : ""}${(
        a.gaps ?? []
      )
        .filter((g) => Number.isFinite(g.gapPct))
        .map(
          (g, i) =>
            `<button type="button" aria-pressed="false" aria-label="Inspect ${esc(a.symbol)} ${esc(g.tokenSymbol)} ${fmtPct(g.gapPct)}" data-asset="${a.rwaId}" data-wrapper="${esc(g.tokenSymbol)}" class="field-dot ${g.gapPct < 0 ? "negative" : "positive"}" style="left:${50 + (g.gapPct / extent) * 46}%;top:${24 + i * 48}px"><span class="dot-tooltip">${esc(g.tokenSymbol)} · ${fmtPct(g.gapPct)}</span></button>`,
        )
        .join(
          "",
        )}${!(a.gaps ?? []).length ? '<span class="no-comparison">No comparable observations</span>' : ""}</div>
      <span class="field-value">${a.maxAbsGapPct === null ? "—" : `${fmt(a.maxAbsGapPct, 2)}<small>%</small>`}<span class="field-arrow">↗</span></span>
    </div>`,
        )
        .join("") ||
      '<p class="empty muted">No observations available. Check the data source in Diagnostics.</p>'
    }
    <div class="field-axis field-bottom"><span></span><div><span>BELOW AGGREGATE</span><span>ABOVE AGGREGATE</span></div><span></span></div>
  </div>`;
}
