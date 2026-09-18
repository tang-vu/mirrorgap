#!/usr/bin/env node
import { createRuntime, type RuntimeInstance } from "@mirrorgap/runtime";
import { CmcError } from "@mirrorgap/cmc";
import { verifyReceipt } from "@mirrorgap/core";
import { c, fmtN, fmtPct, sevColor, table } from "./format.js";

const HELP = `MirrorGap — is tokenized reality still matching reality?

Usage: mirrorgap <command> [options]

Commands:
  doctor                      Check config, data mode, CMC capabilities, DB
  scan [--symbols A,B]        Run one observation scan
  inspect <symbol|rwa_id>     Deep look at one asset's parity + dispersion
  watch [--interval N]        Continuous scan loop, prints anomalies
  events [--status X]         List anomaly events
  event <id>                  Event detail + claim ledger
  receipt <eventId> [--verify] Show or verify an evidence receipt
  cmc-proof                   Proof of real CMC integration (key info + calls)
  serve [--port N]            Start the observatory web server

Flags: --fixture | --live (default: auto), --db <path>, --json
`;

function argFlag(args: string[], name: string): string | null {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? "") : null;
}
const has = (args: string[], name: string) => args.includes(`--${name}`);

function makeRuntime(args: string[]): RuntimeInstance {
  const dataMode = has(args, "fixture") ? "fixture" : has(args, "live") ? "live" : undefined;
  const dbPath = argFlag(args, "db") ?? undefined;
  return createRuntime({
    ...(dataMode ? { dataMode } : {}),
    ...(dbPath ? { dbPath } : {}),
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    console.log(HELP);
    return;
  }

  switch (cmd) {
    case "doctor":
      return doctor(args);
    case "scan":
      return scanCmd(args);
    case "inspect":
      return inspect(args);
    case "watch":
      return watch(args);
    case "events":
      return events(args);
    case "event":
      return eventDetail(args);
    case "receipt":
      return receipt(args);
    case "cmc-proof":
      return cmcProof(args);
    case "serve":
      return serve(args);
    default:
      console.error(`unknown command: ${cmd}\n`);
      console.log(HELP);
      process.exit(1);
  }
}

/* ---------------- doctor ---------------- */
async function doctor(args: string[]) {
  const inst = makeRuntime(args);
  const { config, runtime } = inst;
  console.log(c.bold("MirrorGap doctor\n"));
  console.log(`  data mode        ${config.dataMode === "live" ? c.green("live") : c.yellow("fixture")}`);
  console.log(`  db path          ${config.dbPath}`);
  console.log(
    `  thresholds       info≥${config.thresholds.info}% watch≥${config.thresholds.watch}% high≥${config.thresholds.high}% critical≥${config.thresholds.critical}%`,
  );
  console.log(`  confirm scans    ${config.confirmScans}`);
  console.log(`  scan interval    ${config.scanIntervalSeconds}s`);
  console.log(`  freshness        fresh<${config.freshSeconds}s aging<${config.agingSeconds}s`);
  const caps = runtime.capabilities();
  console.log(
    `  market-pairs     ${caps.marketPairs === "yes" ? c.green("available") : caps.marketPairs === "no" ? c.yellow("unavailable (Growth+ plan required)") : "unknown"}`,
  );
  console.log(`  assets stored    ${runtime.store.listAssets().length}`);
  console.log(`  events stored    ${runtime.store.listEvents({}).length}`);
  console.log(`  latest scan      ${runtime.store.latestScan()?.scanId ?? "none yet"}`);
  if (config.dataMode === "live") {
    try {
      const info = await runtime.source.getKeyInfo();
      const plan = info.data?.plan as Record<string, unknown> | undefined;
      const usage = info.data?.usage as Record<string, unknown> | undefined;
      console.log(`\n  ${c.bold("CMC key")} (from /v1/key/info)`);
      console.log(`    plan           ${String(plan?.["name"] ?? plan?.["tier"] ?? "unknown")}`);
      console.log(`    credits/day    ${JSON.stringify(usage?.["current_day"] ?? "n/a")}`);
      console.log(
        `    credit limit   ${JSON.stringify(plan?.["credit_limit_daily"] ?? plan?.["credit_limit_monthly"] ?? "n/a")}`,
      );
    } catch (err) {
      console.log(`\n  ${c.red("CMC key check failed:")} ${err instanceof Error ? err.message : err}`);
    }
  } else {
    console.log(`\n  ${c.dim("live mode disabled — set CMC_API_KEY to verify against the real API")}`);
  }
  inst.close();
}

/* ---------------- scan ---------------- */
async function scanCmd(args: string[]) {
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

/* ---------------- inspect ---------------- */
async function inspect(args: string[]) {
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

/* ---------------- watch ---------------- */
async function watch(args: string[]) {
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

/* ---------------- events ---------------- */
async function events(args: string[]) {
  const inst = makeRuntime(args);
  const status = argFlag(args, "status") ?? undefined;
  const list = inst.runtime.listEvents(status ? { status } : {});
  if (has(args, "json")) {
    console.log(JSON.stringify(list, null, 2));
    return inst.close();
  }
  const rows = list.map((e) => [
    e.eventId,
    e.assetSymbol,
    e.kind,
    sevColor(e.severity),
    e.status,
    fmtPct(e.latestDeviationPct),
    String(e.confirmations),
    e.lastSeenAt.slice(0, 19).replace("T", " "),
  ]);
  console.log(
    rows.length
      ? table(rows, ["event", "asset", "kind", "severity", "status", "dev", "conf", "last seen"])
      : c.dim("no events"),
  );
  inst.close();
}

async function eventDetail(args: string[]) {
  const id = args[1];
  if (!id) {
    console.error("event requires an id");
    process.exit(1);
  }
  const inst = makeRuntime(args);
  const d = inst.runtime.getEventDetail(id);
  if (!d) {
    console.error(`unknown event ${id}`);
    return inst.close();
  }
  if (has(args, "json")) {
    console.log(JSON.stringify(d, null, 2));
    return inst.close();
  }
  const e = d.event;
  console.log(
    c.bold(`\n${e.eventId}`) + ` — ${e.assetSymbol} ${e.kind} ${sevColor(e.severity)} [${e.status}]`,
  );
  console.log(`  first seen ${e.firstSeenAt}   last seen ${e.lastSeenAt}   confirmations ${e.confirmations}`);
  console.log(`  max deviation ${fmtPct(e.maxDeviationPct)}   mode ${e.dataMode}`);
  if (d.investigation) {
    console.log(c.bold("\n  Claim ledger"));
    for (const cl of d.investigation.claims) {
      const col =
        cl.kind === "observed"
          ? c.green
          : cl.kind === "derived"
            ? c.blue
            : cl.kind === "supported_hypothesis"
              ? c.yellow
              : c.red;
      console.log(`   ${col("■")} ${col(cl.kind)}  ${cl.statement}`);
    }
    for (const l of d.investigation.limitations) console.log(`   ${c.dim("⚠ " + l)}`);
  } else {
    console.log(c.dim("\n  investigation pending (event not confirmed)"));
  }
  if (d.receipt) {
    console.log(c.bold("\n  Receipt"));
    console.log(`    ${d.receipt.receiptId}  ${d.receipt.receiptHash.slice(0, 48)}…`);
    console.log(
      `    verification: ${d.verification?.ok ? c.green("✓ hash + schema valid") : c.red("✗ " + (d.verification?.errors.join("; ") ?? "failed"))}`,
    );
  }
  inst.close();
}

/* ---------------- receipt ---------------- */
async function receipt(args: string[]) {
  const id = args[1];
  if (!id) {
    console.error("receipt requires an event id (or a receipt JSON file with --file)");
    process.exit(1);
  }
  if (has(args, "verify")) {
    // verify a stored receipt by event id, or a raw JSON file
    const file = argFlag(args, "file");
    if (file) {
      const { readFileSync } = await import("node:fs");
      const raw = JSON.parse(readFileSync(file, "utf8"));
      const v = verifyReceipt(raw);
      console.log(v.ok ? c.green(`✓ verified ${raw.receiptId ?? ""}`) : c.red(`✗ ${v.errors.join("; ")}`));
      return;
    }
  }
  const inst = makeRuntime(args);
  const r = inst.runtime.store.receiptForEvent(id);
  if (!r) {
    console.error(`no receipt for ${id}`);
    return inst.close();
  }
  if (has(args, "verify")) {
    const v = verifyReceipt(r);
    console.log(`${r.receiptId}  ${v.ok ? c.green("✓ verified") : c.red("✗ " + v.errors.join("; "))}`);
    console.log(`  expected ${v.expectedHash}\n  actual   ${v.actualHash}`);
  } else if (has(args, "json")) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.log(c.bold(`\n${r.receiptId}`) + c.dim(` (${r.schema})`));
    console.log(`  event       ${r.eventId}`);
    console.log(`  generated   ${r.generatedAt}`);
    console.log(`  hash        ${r.receiptHash}`);
    console.log(`  signature   ${r.signature ? `${r.signature.alg}` : "unsigned"}`);
    console.log(`  verify      mirrorgap receipt ${r.eventId} --verify`);
  }
  inst.close();
}

/* ---------------- cmc-proof ---------------- */
async function cmcProof(args: string[]) {
  const inst = makeRuntime(args);
  const { runtime } = inst;
  console.log(c.bold("CMC integration proof\n"));
  console.log(`  mode             ${inst.config.dataMode}`);
  console.log(`  capabilities     ${JSON.stringify(runtime.capabilities())}`);
  if (inst.config.dataMode === "live") {
    try {
      const key = await runtime.source.getKeyInfo();
      console.log(`\n  ${c.bold("/v1/key/info")}`);
      console.log(
        JSON.stringify(key.data, null, 2)
          .split("\n")
          .map((l) => `  ${l}`)
          .join("\n"),
      );
      console.log(`  ${c.dim(`credits used by this call: ${key.creditCount ?? "n/a"}`)}`);
    } catch (err) {
      const e = err instanceof CmcError ? `${err.kind}: ${err.message}` : String(err);
      console.log(c.red(`  key-info failed: ${e}`));
    }
  }
  const diags = inst.diagnostics.entries.slice(-15);
  if (diags.length) {
    console.log(c.bold("\n  Recent CMC calls (endpoint, status, credits, latency)"));
    for (const d of diags) {
      console.log(
        `    ${d.at.slice(11, 19)}  ${d.endpoint.padEnd(42)} ${d.httpStatus ?? "—"}  ${d.outcome}  ${d.latencyMs}ms  credits=${d.creditCount ?? "—"}`,
      );
    }
  } else {
    console.log(c.dim("\n  no calls yet — run a scan first"));
  }
  inst.close();
}

/* ---------------- serve ---------------- */
async function serve(args: string[]) {
  const port = argFlag(args, "port");
  if (port) process.env.PORT = port;
  const { spawn } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const webDir = fileURLToPath(new URL("../../web", import.meta.url));
  const child = spawn("pnpm", ["dev"], {
    cwd: webDir,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  child.on("exit", (code) => process.exit(code ?? 0));
  process.on("SIGINT", () => child.kill("SIGINT"));
}

main().catch((err) => {
  console.error(c.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
