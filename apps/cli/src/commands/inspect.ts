import { c, fmtN, fmtPct, sevColor, table } from "../format.js";
import { argFlag, has, makeRuntime } from "./context.js";
import type { HistoryWindow } from "@mirrorgap/core";

const SPARK = "▁▂▃▄▅▆▇█";

function sparkline(values: (number | null)[]): string {
  const nums = values.filter((v): v is number => v !== null);
  if (!nums.length) return "";
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  return values
    .map((v) => (v === null ? "·" : SPARK[Math.min(7, Math.floor(((v - min) / span) * 8))]))
    .join("");
}

/* ---------------- inspect ---------------- */
export async function inspect(args: string[]) {
  const target = args[1];
  if (!target) {
    console.error("inspect requires a symbol or rwa_id");
    process.exit(1);
  }
  const inst = makeRuntime(args);
  // ensure fresh data for this asset
  const isId = /^\d+$/.test(target);
  const symbols = isId ? undefined : [target.toUpperCase()];
  const out = await inst.runtime.scan({ ...(symbols ? { symbols } : {}) });
  const snap = isId
    ? (out.snapshots.find((s) => s.rwaId === Number(target)) ??
      inst.runtime.store.latestSnapshot(Number(target)))
    : (out.snapshots[0] ?? null);
  if (!snap) {
    console.error(`no data for ${target}`);
    return inst.close();
  }
  const asset = inst.runtime.store.getAsset(snap.rwaId)!;
  const reps = inst.runtime.store.listRepresentations(snap.rwaId);
  if (has(args, "json")) {
    console.log(JSON.stringify({ asset, snapshot: snap, representations: reps }, null, 2));
    return inst.close();
  }
  console.log(
    c.bold(`\n${asset.name} (${asset.symbol})`) + c.dim(` rwa_id=${asset.rwaId} type=${asset.assetType}`),
  );
  console.log(`  primary exchange   ${asset.primaryExchange ?? "unknown"}`);
  console.log(`  reference          ${snap.reference.state} (${snap.reference.aggregateFreshness.state})`);
  console.log(
    `  underlying market  ${snap.reference.underlyingMarket} ${c.dim(snap.reference.underlyingDetail)}`,
  );
  console.log(
    `  severity           ${sevColor(snap.severity)}   class: ${snap.classification ?? "—"}   quality: ${(snap.dataQuality.score * 100).toFixed(0)}%`,
  );
  for (const ex of snap.reference.explanations) console.log(`  ${c.dim("· " + ex)}`);
  if (snap.gaps.length) {
    console.log(c.bold("\n  Parity gaps vs tokenized aggregate"));
    const rows = snap.gaps.map((g) => [
      g.tokenSymbol,
      fmtN(g.tokenPrice),
      fmtN(g.referencePrice),
      fmtPct(g.gapPct),
    ]);
    console.log(table(rows, ["wrapper", "token px", "ref px", "gap"]));
  }
  if (snap.dispersion.wrapperCount >= 2) {
    console.log(c.bold("\n  Cross-wrapper dispersion"));
    const d = snap.dispersion;
    console.log(
      `    spread ${fmtPct(d.dispersionPct)}  min ${d.minTokenSymbol} @ ${fmtN(d.minPrice)}  max ${d.maxTokenSymbol} @ ${fmtN(d.maxPrice)}`,
    );
  }
  console.log(c.bold("\n  Wrappers"));
  for (const r of reps)
    console.log(`    ${r.symbol.padEnd(10)} ${c.dim(r.issuerName ?? r.issuerId ?? "unknown issuer")}`);
  inst.close();
}

/* ---------------- history ---------------- */
export async function history(args: string[]) {
  const target = args[1];
  if (!target) {
    console.error("history requires a symbol or rwa_id  (windows: 1h 6h 24h 7d all)");
    process.exit(1);
  }
  const inst = makeRuntime(args);
  const sym = target.toUpperCase();
  const asset = /^\d+$/.test(target)
    ? inst.runtime.store.getAsset(Number(target))
    : inst.runtime.store.findAssetBySymbol(sym);
  if (!asset) {
    console.error(`unknown asset ${target} — run a scan first`);
    return inst.close();
  }
  const window = (argFlag(args, "window") ?? "24h") as HistoryWindow;
  const h = inst.runtime.assetHistory(asset.rwaId, { window });
  if (has(args, "json")) {
    console.log(JSON.stringify(h, null, 2));
    return inst.close();
  }
  console.log(
    c.bold(`\n${asset.symbol} integrity history`) +
      c.dim(` window=${h.window} points=${h.points.length} (${inst.config.dataMode} mode)`),
  );
  if (!h.points.length) {
    console.log(c.dim("  no observations in this window"));
    return inst.close();
  }
  const gaps = h.points.map((p) => p.maxAbsGapPct);
  const disp = h.points.map((p) => p.dispersionPct);
  const FRESH_ORD: Record<string, number> = { fresh: 0, aging: 1, stale: 2, unavailable: 3 };
  const fresh = h.points.map((p) => FRESH_ORD[p.aggregateFreshness] ?? null);
  console.log(`  |gap|%     ${sparkline(gaps)}   peak ${h.stats.peakAbsGapPct?.toFixed(2) ?? "—"}%`);
  console.log(`  dispersion ${sparkline(disp)}   peak ${h.stats.peakDispersionPct?.toFixed(2) ?? "—"}%`);
  console.log(`  staleness  ${sparkline(fresh)}   stale share ${(h.stats.staleShare * 100).toFixed(0)}%`);
  console.log(
    `  range      ${h.stats.firstMeasuredAt?.slice(11, 19) ?? "?"} → ${h.stats.lastMeasuredAt?.slice(11, 19) ?? "?"} · anomalous ${(h.stats.anomalousShare * 100).toFixed(0)}% · mkt-closed ${(h.stats.marketClosedShare * 100).toFixed(0)}%`,
  );
  inst.close();
}
