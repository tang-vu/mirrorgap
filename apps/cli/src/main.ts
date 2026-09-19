#!/usr/bin/env node
import { c } from "./format.js";
import { doctor, stats, alerts, cmcProof } from "./commands/observe.js";
import { scanCmd, radar, watch } from "./commands/scan.js";
import { inspect, history } from "./commands/inspect.js";
import { events, eventDetail, timeline } from "./commands/events.js";
import { receipt, capsule } from "./commands/evidence.js";
import { watchlist } from "./commands/watchlist.js";
import { seed, serve } from "./commands/demo.js";

const HELP = `MirrorGap — the market integrity layer for tokenized real-world assets.
Observe. Detect. Investigate. Prove.

Usage: mirrorgap <command> [options]

Observe
  doctor                      Config, data mode, capabilities, signing, alerts, DB
  scan [--symbols A,B]        Run one observation scan
  radar                       Current integrity state of watched assets
  stats                       Observatory overview + storage counters
  watch [--interval N]        Continuous scan loop, prints anomalies

Investigate
  inspect <symbol|rwa_id>     Deep look at one asset's parity + dispersion
  history <symbol|rwa_id>     Divergence/dispersion/staleness time series
                             [--window 1h|6h|24h|7d|all]
  events [--status X]         List anomaly events (+ peak, confirmations)
  event <id>                  Event detail, timeline, claim ledger, receipt
  timeline <id>               Incident replay narrative

Prove
  capsule <eventId>           Evidence Capsule (shareable, --out file to export)
  receipt <eventId>           Show an evidence receipt
  receipt <eventId> --verify  Re-hash + verify schema, hash, signature
  receipt x --verify --file f.json   Verify an exported receipt file
  cmc-proof                   Proof of real CMC integration (key info + calls)

Operate
  watchlist                   List watched assets
  watchlist add <symbol>      Watch an asset [--id n] [--thresholds i,w,h,c]
  watchlist remove <symbol>   Stop watching
  alerts                      Alert delivery log + configured destinations
  seed [--ticks N]            Replay N deterministic fixture scans (demo data)
  serve [--port N]            Start the observatory web server

Flags: --fixture | --live (default: auto) · --db <path> · --json
`;

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
    case "radar":
      return radar(args);
    case "stats":
      return stats(args);
    case "inspect":
      return inspect(args);
    case "history":
      return history(args);
    case "watch":
      return watch(args);
    case "events":
      return events(args);
    case "event":
      return eventDetail(args);
    case "timeline":
      return timeline(args);
    case "capsule":
      return capsule(args);
    case "receipt":
      return receipt(args);
    case "cmc-proof":
      return cmcProof(args);
    case "watchlist":
      return watchlist(args);
    case "alerts":
      return alerts(args);
    case "seed":
      return seed(args);
    case "serve":
      return serve(args);
    default:
      console.error(`unknown command: ${cmd}\n`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(c.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
