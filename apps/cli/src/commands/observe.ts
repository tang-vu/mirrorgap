import { CmcError } from "@mirrorgap/cmc";
import { c, table } from "../format.js";
import { makeRuntime } from "./context.js";

/* ---------------- doctor ---------------- */
export async function doctor(args: string[]) {
  const inst = makeRuntime(args);
  const { config, runtime } = inst;
  console.log(c.bold("MirrorGap doctor\n"));
  console.log(`  data mode        ${config.dataMode === "live" ? c.green("live") : c.yellow("fixture")}`);
  console.log(`  fixture scenario ${config.dataMode === "fixture" ? config.fixtureScenario : "—"}`);
  console.log(`  db path          ${config.dbPath}`);
  console.log(
    `  thresholds       info≥${config.thresholds.info}% watch≥${config.thresholds.watch}% high≥${config.thresholds.high}% critical≥${config.thresholds.critical}%`,
  );
  console.log(`  confirm scans    ${config.confirmScans}`);
  console.log(`  scan interval    ${config.scanIntervalSeconds}s`);
  console.log(`  watch limit      ${config.watchLimit}`);
  console.log(`  retention        ${config.retentionDays === 0 ? "disabled" : `${config.retentionDays}d`}`);
  console.log(`  freshness        fresh<${config.freshSeconds}s aging<${config.agingSeconds}s`);
  console.log(
    `  signing          ${inst.signingConfigured ? c.green(`ed25519 ${inst.publicKey?.slice(0, 16)}…`) : c.dim("unsigned")}`,
  );
  console.log(
    `  alerts           ${runtime.alerts.configured ? c.green(runtime.alerts.destinationLabels.join(", ")) : c.dim("none configured")} (min ${config.alerts.minSeverity})`,
  );
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

/* ---------------- stats ---------------- */
export async function stats(args: string[]) {
  const inst = makeRuntime(args);
  const ov = inst.runtime.overview();
  if (args.includes("--json")) {
    console.log(JSON.stringify(ov, null, 2));
    return inst.close();
  }
  console.log(c.bold("Observatory overview\n"));
  console.log(`  data mode        ${ov.dataMode === "live" ? c.green("live") : c.yellow("fixture")}`);
  console.log(`  assets watched   ${ov.assetsWatched} (${ov.assetsAnomalous} anomalous)`);
  console.log(`  watchlist        ${ov.watchlistSize} enabled`);
  console.log(
    `  active incidents ${ov.activeIncidents} (${ov.confirmedIncidents} confirmed, ${ov.criticalOrHigh} high+)`,
  );
  console.log(`  event counts     ${JSON.stringify(ov.eventCounts)}`);
  console.log(
    `  latest scan      ${ov.latestScan ? `${ov.latestScan.scanId} @ ${ov.latestScan.startedAt} (${ov.latestScan.status})` : "none"}`,
  );
  console.log(
    `  storage          ${ov.storage.snapshots} snapshots · ${ov.storage.transitions} transitions · ${ov.storage.dbBytes !== null ? `${(ov.storage.dbBytes / 1024).toFixed(0)} KiB` : "n/a"}`,
  );
  inst.close();
}

/* ---------------- alerts ---------------- */
export async function alerts(args: string[]) {
  const inst = makeRuntime(args);
  const list = inst.runtime.listAlertLog(50);
  if (args.includes("--json")) {
    console.log(JSON.stringify({ configured: inst.runtime.alerts.configured, alerts: list }, null, 2));
    return inst.close();
  }
  console.log(
    c.bold("Alert log\n") +
      `  destinations: ${inst.runtime.alerts.destinationLabels.join(", ") || c.dim("none configured")} · min severity ${inst.config.alerts.minSeverity}\n`,
  );
  const rows = list.map((a) => [
    a.sentAt.slice(0, 19).replace("T", " "),
    a.eventId,
    a.transition,
    a.severity,
    a.destination,
    a.status === "sent" ? c.green(a.status) : c.red(a.status),
    a.detail ?? "",
  ]);
  console.log(
    rows.length
      ? table(rows, ["sent at", "event", "transition", "severity", "dest", "status", "detail"])
      : c.dim("no alerts recorded"),
  );
  inst.close();
}

/* ---------------- cmc-proof ---------------- */
export async function cmcProof(args: string[]) {
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
