#!/usr/bin/env node
/**
 * benchmark — measures the hot paths a judge/user actually hits.
 * Boots the fixture server with a seeded incident history, then times:
 *   scan (full pipeline), radar, asset history, timeline, capsule,
 *   overview, receipt verify. Prints p50/p95/max per endpoint.
 *
 *   node scripts/benchmark.mjs [--iters 20] [--seed 31]
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Spawn the server directly (not via pnpm) so child.kill() reaches the actual
// node process — on Windows a pnpm/cmd wrapper leaves the server orphaned.
const WEB_DIR = fileURLToPath(new URL("../apps/web", import.meta.url));

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const ITERS = Number(opt("iters", 20));
const SEED = Number(opt("seed", 31));
const PORT = 8792;
const base = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const env = {
  ...process.env,
  PORT: String(PORT),
  MIRRORGAP_DATA_MODE: "fixture",
  MIRRORGAP_DB_PATH: ":memory:",
  MIRRORGAP_FIXTURE_SCENARIO: "incident_cycle",
  MIRRORGAP_SEED_TICKS: String(SEED),
  MIRRORGAP_CONFIRM_SCANS: "1",
  MIRRORGAP_NO_LOOP: "1", // deterministic: only our timed scans run
};

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const pick = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return { n: s.length, p50: pick(0.5), p95: pick(0.95), max: s[s.length - 1] };
};

let child;
try {
  child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    env,
    cwd: WEB_DIR,
    stdio: "pipe",
  });
  let ready = false;
  for (let i = 0; i < 90 && !ready; i++) {
    await sleep(1000);
    try {
      const r = await fetch(base + "/api/v1/healthz");
      ready = r.ok;
    } catch {}
  }
  if (!ready) throw new Error("server did not start in 90s");

  const timed = async (name, fn, iters = ITERS) => {
    const xs = [];
    for (let i = 0; i < iters; i++) {
      const t0 = performance.now();
      const r = await fn();
      xs.push(performance.now() - t0);
      if (r instanceof Response && !r.ok) throw new Error(`${name} → HTTP ${r.status}`);
    }
    const s = stats(xs);
    console.log(
      `  ${name.padEnd(22)} p50 ${s.p50.toFixed(1).padStart(7)}ms   p95 ${s.p95
        .toFixed(1)
        .padStart(7)}ms   max ${s.max.toFixed(1).padStart(7)}ms   (n=${s.n})`,
    );
    return s;
  };

  console.log(`\nMirrorGap benchmark — fixture mode, ${SEED} seeded scans, n=${ITERS} per endpoint\n`);

  const events = await (await fetch(base + "/api/v1/events")).json();
  const eventId = events.events?.[0]?.eventId;
  const assets = await (await fetch(base + "/api/v1/assets")).json();
  const rwaId = assets.assets?.[0]?.rwaId ?? 1;

  await timed("POST /scan", () => fetch(base + "/api/v1/scan", { method: "POST" }), 10);
  await timed("GET /radar", () => fetch(base + "/api/v1/radar"));
  await timed("GET /assets/:id", () => fetch(`${base}/api/v1/assets/${rwaId}`));
  await timed("GET /assets/:id/history", () =>
    fetch(`${base}/api/v1/assets/${rwaId}/history?window=all&maxPoints=720`),
  );
  await timed("GET /events/:id", () => fetch(`${base}/api/v1/events/${eventId}`));
  await timed("GET /events/:id/timeline", () => fetch(`${base}/api/v1/events/${eventId}/timeline`));
  await timed("GET /capsules/:id", () => fetch(`${base}/api/v1/capsules/${eventId}`));
  await timed("GET /receipts/:id/verify", () => fetch(`${base}/api/v1/receipts/${eventId}/verify`));
  await timed("GET /overview", () => fetch(base + "/api/v1/overview"));

  const ov = await (await fetch(base + "/api/v1/overview")).json();
  console.log(
    `\n  state: ${ov.storage.snapshots} snapshots · ${ov.storage.transitions} transitions · ` +
      `${events.events.length} events · db ${ov.storage.dbBytes ? (ov.storage.dbBytes / 1024).toFixed(0) + " KiB" : "n/a"}\n`,
  );
} finally {
  child?.kill("SIGTERM");
  await sleep(500);
  child?.kill("SIGKILL");
}
