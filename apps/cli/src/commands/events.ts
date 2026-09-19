import { c, fmtPct, sevColor, table } from "../format.js";
import { argFlag, has, makeRuntime } from "./context.js";

const TYPE_ICON: Record<string, string> = {
  candidate_created: "◌",
  observation: "·",
  confirmed: "●",
  severity_escalated: "▲",
  severity_decreased: "▽",
  peak_divergence: "★",
  deviation_increased: "↗",
  deviation_decreased: "↘",
  resolved: "✓",
  invalidated: "✗",
  receipt_issued: "⬡",
};

/* ---------------- events ---------------- */
export async function events(args: string[]) {
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
    fmtPct(e.maxDeviationPct),
    String(e.confirmations),
    e.lastSeenAt.slice(0, 19).replace("T", " "),
  ]);
  console.log(
    rows.length
      ? table(rows, ["event", "asset", "kind", "severity", "status", "dev", "peak", "conf", "last seen"])
      : c.dim("no events"),
  );
  inst.close();
}

/* ---------------- event detail ---------------- */
export async function eventDetail(args: string[]) {
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
  if (d.stats) {
    const dur = Math.round(d.stats.durationMs / 1000);
    console.log(
      `  duration ${dur}s   peak ${fmtPct(d.stats.peakDeviationPct)} @ ${d.stats.peakAt?.slice(11, 19)}   recurrences ${d.stats.recurrences}`,
    );
  }
  if (d.timeline?.length) {
    console.log(c.bold("\n  Timeline"));
    for (const t of d.timeline) {
      const icon = TYPE_ICON[t.type] ?? "·";
      console.log(`    ${t.at.slice(11, 19)}  ${icon} ${t.title}`);
    }
  }
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
    console.log(c.dim(`    capsule: mirrorgap capsule ${e.eventId}`));
  }
  inst.close();
}

/* ---------------- timeline ---------------- */
export async function timeline(args: string[]) {
  const id = args[1];
  if (!id) {
    console.error("timeline requires an event id");
    process.exit(1);
  }
  const inst = makeRuntime(args);
  const tl = inst.runtime.eventTimeline(id);
  if (!tl) {
    console.error(`unknown event ${id}`);
    return inst.close();
  }
  if (has(args, "json")) {
    console.log(JSON.stringify(tl, null, 2));
    return inst.close();
  }
  console.log(
    c.bold(`\nIncident timeline — ${tl.event.eventId}`) +
      c.dim(` ${tl.event.assetSymbol} ${tl.event.kind} [${tl.event.status}]`),
  );
  for (const t of tl.entries) {
    const icon = TYPE_ICON[t.type] ?? "·";
    console.log(`  ${t.at.slice(5, 19).replace("T", " ")}  ${icon} ${c.bold(t.title)}`);
    if (t.detail) console.log(`        ${c.dim(t.detail)}`);
  }
  inst.close();
}
