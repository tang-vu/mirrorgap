/* SVG charts — deterministic rendering, zero deps. */
import { esc, SEV_COLOR } from "./util.js";

/**
 * Time-series line chart.
 * points: [{t: isoDate|epochMs, y: number|null, sev?: string}]
 * opts: {height, yMin, yMax, thresholds: [{y,label,color}], yLabel, area}
 */
export function lineChart(points, opts = {}) {
  const W = 860;
  const H = opts.height ?? 180;
  const padL = 44;
  const padR = 10;
  const padT = 12;
  const padB = 22;
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const pts = points.filter((p) => p.y !== null && p.y !== undefined);
  if (!pts.length) return `<p class="muted">no data in window</p>`;

  const t0 = Math.min(...points.map((p) => +new Date(p.t)));
  const t1 = Math.max(...points.map((p) => +new Date(p.t)));
  const span = Math.max(1, t1 - t0);
  const ys = points.map((p) => p.y).filter((y) => y !== null && y !== undefined);
  const tYs = (opts.thresholds ?? []).map((t) => t.y);
  let yMin = opts.yMin ?? Math.min(0, ...ys, ...tYs);
  let yMax = opts.yMax ?? Math.max(...ys, ...tYs);
  if (yMax === yMin) yMax = yMin + 1;
  const pad = (yMax - yMin) * 0.08;
  yMin -= pad;
  yMax += pad;

  const X = (t) => padL + ((+new Date(t) - t0) / span) * iw;
  const Y = (y) => padT + ih - ((y - yMin) / (yMax - yMin)) * ih;

  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.yLabel ?? "series")}">`;
  // gridlines + y labels
  for (let i = 0; i <= 4; i++) {
    const y = yMin + ((yMax - yMin) * i) / 4;
    svg += `<line x1="${padL}" y1="${Y(y)}" x2="${W - padR}" y2="${Y(y)}" stroke="#ccd7db" stroke-width="1"/>`;
    svg += `<text x="${padL - 6}" y="${Y(y) + 3}" text-anchor="end" class="axis">${y.toFixed(2)}</text>`;
  }
  // x labels: 4 ticks
  for (let i = 0; i <= 4; i++) {
    const t = t0 + (span * i) / 4;
    const lbl = new Date(t).toISOString().slice(11, 16);
    svg += `<text x="${X(t)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : i === 4 ? "end" : "middle"}" class="axis">${lbl}</text>`;
  }
  // threshold lines
  for (const t of opts.thresholds ?? []) {
    if (t.y < yMin || t.y > yMax) continue;
    svg += `<line x1="${padL}" y1="${Y(t.y)}" x2="${W - padR}" y2="${Y(t.y)}" stroke="${t.color ?? "#997215"}" stroke-dasharray="4 4" stroke-width="1" opacity="0.7"/>`;
    svg += `<text x="${W - padR - 2}" y="${Y(t.y) - 3}" text-anchor="end" class="axis" fill="${t.color ?? "#997215"}">${esc(t.label ?? "")}</text>`;
  }
  // zero line when range spans it
  if (yMin < 0 && yMax > 0) {
    svg += `<line x1="${padL}" y1="${Y(0)}" x2="${W - padR}" y2="${Y(0)}" stroke="#8d9187" stroke-width="1"/>`;
  }
  // path (break on nulls)
  let d = "";
  let open = false;
  for (const p of points) {
    if (p.y === null || p.y === undefined) {
      open = false;
      continue;
    }
    d += `${open ? "L" : "M"}${X(p.t).toFixed(1)},${Y(p.y).toFixed(1)} `;
    open = true;
  }
  if (opts.area) {
    // close the area along y=lower bound for the filled region
    let area = "";
    open = false;
    let firstX = 0,
      lastX = 0;
    for (const p of points) {
      if (p.y === null || p.y === undefined) {
        if (open)
          area += `L${lastX.toFixed(1)},${Y(yMin).toFixed(1)} L${firstX.toFixed(1)},${Y(yMin).toFixed(1)} Z `;
        open = false;
        continue;
      }
      const x = X(p.t);
      if (!open) firstX = x;
      area += `${open ? "L" : "M"}${x.toFixed(1)},${Y(p.y).toFixed(1)} `;
      lastX = x;
      open = true;
    }
    if (open)
      area += `L${lastX.toFixed(1)},${Y(yMin).toFixed(1)} L${firstX.toFixed(1)},${Y(yMin).toFixed(1)} Z`;
    svg += `<path d="${area}" fill="${opts.color ?? "#c34736"}" opacity="0.12"/>`;
  }
  svg += `<path d="${d}" fill="none" stroke="${opts.color ?? "#c34736"}" stroke-width="1.8"/>`;
  // severity dots
  for (const p of points) {
    if (p.y === null || p.y === undefined) continue;
    const col = p.sev ? (SEV_COLOR[p.sev] ?? "#697166") : (opts.color ?? "#c34736");
    svg += `<circle data-time="${esc(p.t)}" cx="${X(p.t).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="2.6" fill="${col}"><title>${esc(p.t.slice(11, 19))} · ${p.y.toFixed(3)}</title></circle>`;
  }
  svg += "</svg>";
  return (
    svg +
    `<p class="chart-caption">${esc(opts.yLabel ?? "series")} · UTC ${esc(points[0]?.t)} → ${esc(points.at(-1)?.t)} · ${points.filter((p) => p.y == null).length} missing measurements (line breaks)</p>`
  );
}

/** Compact sparkline for table cells. */
export function sparkline(values, opts = {}) {
  const nums = values.filter((v) => v !== null && v !== undefined);
  if (!nums.length) return "";
  const W = 90;
  const H = 22;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => {
      if (v === null || v === undefined) return null;
      const x = (i / Math.max(1, values.length - 1)) * (W - 4) + 2;
      const y = H - 3 - ((v - min) / span) * (H - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean)
    .join(" ");
  return `<svg width="${W}" height="${H}" class="spark"><polyline points="${pts}" fill="none" stroke="${opts.color ?? "#c34736"}" stroke-width="1.5"/></svg>`;
}
