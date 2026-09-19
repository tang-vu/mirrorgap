import { c, fmtPct, sevColor, table } from "../format.js";
import { argFlag, has, makeRuntime } from "./context.js";

/* ---------------- scan ---------------- */
export async function scanCmd(args: string[]) {
  const inst = makeRuntime(args);
  const symbols = argFlag(args, "symbols")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const out = await inst.runtime.scan({ ...(symbols?.length ? { symbols } : {}) });
  if (has(args, "json")) {
    console.log(JSON.stringify(out, null, 2));
    return inst.close();
  }
  console.log(c.bold(`\nScan ${out.scan.scanId}`) + c.dim(` (${out.scan.dataMode} mode)`));
  const rows = out.snapshots.map((s) => {
    const asset = inst.runtime.store.getAsset(s.rwaId);
    const maxGap = s.gaps.reduce((m, g) => Math.max(m, Math.abs(g.gapPct)), 0);
    return [
      asset?.symbol ?? String(s.rwaId),
      s.reference.state,
      s.reference.underlyingMarket,
      s.gaps.length
        ? fmtPct(s.gaps.reduce((a, g) => (Math.abs(g.gapPct) > Math.abs(a.gapPct) ? g : a)).gapPct)
        : "—",
      s.dispersion.dispersionPct !== null ? `${s.dispersion.dispersionPct.toFixed(2)}%` : "—",
      sevColor(s.severity),
      s.classification ?? "—",
      maxGap > 0 ? `${maxGap.toFixed(2)}%` : "—",
    ];
  });
  console.log(table(rows, ["asset", "ref", "mkt", "max gap", "dispersion", "severity", "class", "|gap|"]));
  if (out.events.length) {
    console.log(`\n${c.bold("Events:")}`);
    for (const e of out.events)
      console.log(`  ${e.eventId}  ${e.assetSymbol} ${e.kind} ${sevColor(e.severity)} [${e.status}]`);
  } else {
    console.log(c.dim("\nno anomalies this scan"));
  }
  inst.close();
}

/* ---------------- radar ---------------- */
export async function radar(args: string[]) {
  const inst = makeRuntime(args);
  const rows0 = inst.runtime.radar();
  if (has(args, "json")) {
    console.log(JSON.stringify(rows0, null, 2));
    return inst.close();
  }
  if (!rows0.length) {
    console.log(c.dim("radar empty — run a scan first"));
    return inst.close();
  }
  const rows = rows0.map(({ asset, snapshot: s }) => [
    asset.symbol,
    s.reference.state,
    s.reference.underlyingMarket,
    s.gaps.length ? fmtPct(Math.max(...s.gaps.map((g) => Math.abs(g.gapPct)))) : "—",
    s.dispersion.dispersionPct !== null ? `${s.dispersion.dispersionPct.toFixed(2)}%` : "—",
    s.reference.aggregateFreshness.state,
    sevColor(s.severity),
    s.classification ?? "—",
  ]);
  console.log(c.bold(`\nIntegrity radar`) + c.dim(` (${inst.config.dataMode} mode)`));
  console.log(table(rows, ["asset", "ref", "mkt", "|gap|", "dispersion", "fresh", "severity", "class"]));
  inst.close();
}

/* ---------------- watch ---------------- */
export async function watch(args: string[]) {
  const inst = makeRuntime(args);
  const interval = Math.max(15, Number(argFlag(args, "interval") ?? inst.config.scanIntervalSeconds));
  console.log(
    c.bold(`MirrorGap watch`) +
      c.dim(` — scanning every ${interval}s (${inst.config.dataMode} mode). Ctrl+C to stop.\n`),
  );
  inst.bus.on(
    "event",
    (e: {
      event: {
        eventId: string;
        assetSymbol: string;
        kind: string;
        severity: string;
        status: string;
        latestDeviationPct: number;
      };
    }) => {
      const ev = e.event;
      console.log(
        `  ${c.red("◉")} ${ev.eventId} ${ev.assetSymbol} ${ev.kind} ${sevColor(ev.severity)} ${fmtPct(ev.latestDeviationPct)} [${ev.status}]`,
      );
    },
  );
  const tick = async () => {
    try {
      const out = await inst.runtime.scan();
      const anomalies = out.snapshots.filter((s) => s.severity !== "none").length;
      console.log(
        `${c.dim(new Date().toLocaleTimeString())} scanned ${out.snapshots.length} assets — ${anomalies || "no"} anomalies`,
      );
    } catch (err) {
      console.log(c.red(`  scan failed: ${err instanceof Error ? err.message : err}`));
    }
  };
  await tick();
  const t = setInterval(tick, interval * 1000);
  process.on("SIGINT", () => {
    clearInterval(t);
    inst.close();
    process.exit(0);
  });
}
