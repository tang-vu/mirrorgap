#!/usr/bin/env node
/**
 * demo:check — proves the demo path end-to-end without secrets.
 * Boots the web server in fixture mode, scans, checks radar/events,
 * verifies a receipt, prints PASS/FAIL. Used in CI and before recording.
 */
import { spawn } from "node:child_process";

const PORT = 8791;
const base = `http://127.0.0.1:${PORT}`;
const env = {
  ...process.env,
  PORT: String(PORT),
  MIRRORGAP_DATA_MODE: "fixture",
  MIRRORGAP_DB_PATH: ":memory:",
  MIRRORGAP_CONFIRM_SCANS: "1",
  MIRRORGAP_SCAN_INTERVAL: "15",
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (p) => {
  const r = await fetch(base + p);
  if (!r.ok) throw new Error(`${p} → ${r.status}`);
  return r.json();
};

let child;
const results = [];
const check = (name, ok, detail = "") => {
  results.push([name, ok]);
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? "  — " + detail : ""}`);
};

try {
  child = spawn("pnpm", ["--filter", "@mirrorgap/web", "dev"], {
    env,
    stdio: "pipe",
    shell: process.platform === "win32",
  });
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    await sleep(1000);
    try {
      await get("/api/v1/health");
      ready = true;
    } catch {}
  }
  if (!ready) throw new Error("server did not start in 60s");
  check("server boots (fixture mode)", true);

  const health = await get("/api/v1/health");
  check(
    "health reports fixture mode + capabilities",
    health.dataMode === "fixture" && health.capabilities?.marketPairs === "no",
  );

  const scan = await (await fetch(base + "/api/v1/scan", { method: "POST" })).json();
  check(
    "scan completes",
    scan.scan?.status === "completed",
    `${scan.snapshots} snapshots, ${scan.events} events`,
  );

  const radar = await get("/api/v1/radar");
  check("radar populated", radar.assets?.length >= 5, `${radar.assets?.length} assets`);

  const events = await get("/api/v1/events");
  check("anomaly events exist", events.events?.length > 0, `${events.events?.length} events`);

  const id = events.events?.[0]?.eventId;
  const detail = await get(`/api/v1/events/${id}`);
  check(
    "claim ledger classified",
    detail.investigation?.claims?.length > 0 &&
      detail.investigation.claims.every((c) =>
        ["observed", "derived", "supported_hypothesis", "unknown"].includes(c.kind),
      ),
  );

  const verify = await get(`/api/v1/receipts/${id}/verify`);
  check("receipt verifies (schema + sha256)", verify.ok === true && verify.hashOk === true);

  const html = await (await fetch(base + "/")).text();
  check("UI served", html.includes("MirrorGap"));

  const app = await (await fetch(base + "/app.js")).text();
  check("UI assets served", app.length > 1000);
} catch (err) {
  check("fatal", false, err.message);
} finally {
  child?.kill("SIGTERM");
  await sleep(500);
  child?.kill("SIGKILL");
}

const failed = results.filter(([, ok]) => !ok);
console.log(
  `\n${failed.length === 0 ? "PASS" : "FAIL"} — ${results.length - failed.length}/${results.length} checks`,
);
process.exit(failed.length === 0 ? 0 : 1);
